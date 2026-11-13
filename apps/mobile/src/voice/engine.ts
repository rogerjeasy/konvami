import { ApiError, type CallPlan, type VoiceCall } from '@konvami/api-client';
import type { ClipPlayer } from '@/lib/clip-player';
import { premiumPlayback } from './premium-playback';
import { VoiceError, type VoiceErrorCode } from './errors';
import type { AudioLevels, RtcSession } from './rtc-session';
import { helpNote, type HelpKind } from './help';
import { transportEvent } from './transport-event';
import {
  abortable,
  CONTINUATION_TIMEOUT_MS,
  MAX_CONTINUATIONS,
  retryContinuation,
} from './continuation';

export { VoiceError, type VoiceErrorCode } from './errors';
export type { AudioLevels } from './rtc-session';

/**
 * A live voice call, as screens use it: start, stop, mute, the call's events and how loud each
 * side is. This is the `VoiceEngine` of the spec (§9.3): the provider behind it (OpenAI Realtime
 * over WebRTC today) can change without touching a screen.
 */
export interface VoiceEngine {
  /**
   * Sets the call up and returns its id, the time after which the server ends it and, for a
   * practice conversation, its plan. Rejects with a `VoiceError`; nothing is left open when it
   * does.
   */
  start(): Promise<StartedCall>;
  /** Ends the call and frees the microphone. Safe to call at any time, any number of times. */
  stop(): void;
  setMuted(muted: boolean): void;
  setPushToTalk(enabled: boolean): void;
  /** True only after a manual turn actually starts on the open transport. */
  beginTurn(): boolean;
  endTurn(): void;
  /**
   * Says a line for the learner without their voice (a tapped "I don't know"): the persona
   * answers it like a spoken one, and listeners get it as `{ type: 'learner.typed', id, text }`.
   */
  say(text: string): void;
  /**
   * Asks the partner for help (a tapped "Slower"): a note that is not a line of the learner, so
   * it is neither shown nor kept. A reply still playing stops first. Listeners get
   * `{ type: 'learner.help', kind }`.
   */
  help(kind: HelpKind): void;
  /**
   * The call's events (see `conversationReducer`), plus `{ type: 'connection.lost' }` when the
   * connection drops. Returns the function that stops listening.
   */
  subscribe(listener: (event: unknown) => void): () => void;
  levels(): Promise<AudioLevels>;
}

export interface StartedCall {
  callId: string;
  maxSeconds: number;
  /** What a practice conversation sets out to practise; null for the guide's calls. */
  plan: CallPlan | null;
}

/** Failures of the call-creating request that mean the same on the voice screen. */
const API_CODES: Record<string, VoiceErrorCode> = {
  consent_required: 'consent_required',
  minutes_used_up: 'minutes_used_up',
  plan_required: 'plan_required',
  voice_paused: 'voice_paused',
  voice_unavailable: 'voice_unavailable',
  not_configured: 'voice_unavailable',
  waking_up: 'voice_unavailable',
  network: 'network',
};

// Realtime requires at least 100 ms of input; leave a small capture margin.
const MIN_MANUAL_TURN_MS = 150;

const SILENCE: AudioLevels = { persona: 0, learner: 0 };

export function createVoiceEngine({
  createSession,
  startCall,
  continueCall,
  endCall,
  clips,
  now = Date.now,
}: {
  /** A WebRTC session for this platform, or null when the build has none. */
  createSession: () => RtcSession | null;
  clips?: ClipPlayer;
  now?: () => number;
  /** Trades the SDP offer for the server's answer (`api.startVoiceCall`). */
  startCall: (sdpOffer: string) => Promise<VoiceCall>;
  /** Only practice supplies these; other call purposes retain their existing lifecycle. */
  continueCall?: (rootId: string, attemptId: string, sdpOffer: string) => Promise<VoiceCall>;
  endCall?: (rootId: string) => Promise<void>;
}): VoiceEngine {
  let session: RtcSession | null = null;
  let stopped = false;
  let typedLines = 0;
  let manual = false;
  let holding = false;
  let heldAt = 0;
  let muted = false;
  let rootId: string | null = null;
  let endsAt = 0;
  let continuations = 0;
  let recovering = false;
  let finished = false;
  let ending = false;
  let recovery: AbortController | null = null;
  const listeners = new Set<(event: unknown) => void>();
  const emit = (event: unknown) => listeners.forEach((listener) => listener(event));

  const premium = clips ? premiumPlayback(clips, emit) : null;

  function finalize() {
    if (!rootId || !endCall || ending) return;
    ending = true;
    // If the device is offline, the server's bounded handoff window still finalizes the call.
    void endCall(rootId).catch(() => {});
  }

  function stop() {
    premium?.stop();
    stopped = true;
    recovery?.abort();
    session?.close();
    session = null;
    finalize();
  }

  function bind(next: RtcSession, ready?: () => void) {
    const generation = continuations;
    next.onEvent((event) => {
      if (stopped || session !== next) return;
      const e = event as { type?: string; item?: { type?: string; output?: string } };
      if (e?.type === 'session.created' && ready) {
        const configured =
          !manual ||
          next.send({
            type: 'session.update',
            session: {
              type: 'realtime',
              audio: { input: { turn_detection: null } },
            },
          });
        next.setMuted(muted);
        if (configured) ready();
      }
      if (e?.type === 'conversation.item.done' && e.item?.type === 'function_call_output') {
        try {
          if (JSON.parse(e.item.output ?? '{}').done === true) finished = true;
        } catch {
          /* Incomplete tool output is not a goodbye. */
        }
      }
      const scoped = transportEvent(event, generation);
      premium?.handle(scoped);
      emit(scoped);
    });
    next.onClosed(() => {
      if (stopped || session !== next) return;
      if (recovering) {
        recovery?.abort();
        return;
      }
      if (
        continueCall &&
        rootId &&
        !finished &&
        continuations < MAX_CONTINUATIONS &&
        now() < endsAt
      ) {
        void reconnect();
      } else {
        stop();
        emit({ type: 'connection.lost' });
      }
    });
  }

  async function reconnect() {
    if (!continueCall || !rootId || recovering) return;
    const id = rootId;
    recovering = true;
    continuations += 1;
    holding = false;
    if (manual) muted = true;
    premium?.stop();
    const former = session;
    session = null;
    former?.close();
    const cancel = new AbortController();
    recovery = cancel;
    const timer = setTimeout(
      () => cancel.abort(),
      Math.max(0, Math.min(CONTINUATION_TIMEOUT_MS, endsAt - now())),
    );
    // An idempotency nonce, not a credential; retain it and the same offer across every retry.
    const attemptId = `${now().toString(36)}_${continuations}_${Math.random().toString(36).slice(2, 14)}`;
    emit({ type: 'connection.reconnecting', muted });
    let next: RtcSession | null = null;
    try {
      if (cancel.signal.aborted) throw new VoiceError('stopped');
      next = createSession();
      if (!next) throw new VoiceError('unsupported');
      session = next;
      const ready = new Promise<void>((resolve) => bind(next!, resolve));
      const offer = await abortable(next.offer(), cancel.signal);
      next.setMuted(muted);
      const call = await retryContinuation(() => continueCall(id, attemptId, offer), cancel.signal);
      if (stopped || cancel.signal.aborted) throw new VoiceError('stopped');
      if (call.callId !== id || call.maxSeconds <= 0) throw new VoiceError('voice_unavailable');
      await abortable(next.accept(call.sdp), cancel.signal);
      // SDP acceptance precedes data-channel readiness. Keep controls suspended until the
      // provider greets this transport and the manual microphone setting has been restored.
      await abortable(ready, cancel.signal);
      if (stopped || cancel.signal.aborted) throw new VoiceError('stopped');
      next.setMuted(muted);
      emit({ type: 'connection.restored', muted });
    } catch {
      next?.close();
      if (!stopped) {
        stop();
        emit({ type: 'connection.lost' });
      }
    } finally {
      clearTimeout(timer);
      recovering = false;
      if (recovery === cancel) recovery = null;
    }
  }

  return {
    async start() {
      stopped = false;
      const next = createSession();
      if (!next) throw new VoiceError('unsupported');
      session = next;
      bind(next);
      try {
        const offer = await next.offer();
        if (stopped) throw new VoiceError('stopped');
        const call = await startCall(offer);
        rootId = call.callId;
        endsAt = now() + call.maxSeconds * 1000;
        if (stopped) {
          finalize();
          throw new VoiceError('stopped');
        }
        await next.accept(call.sdp);
        if (stopped) throw new VoiceError('stopped');
        return { callId: call.callId, maxSeconds: call.maxSeconds, plan: call.plan };
      } catch (error) {
        next.close();
        if (session === next) session = null;
        finalize();
        if (error instanceof VoiceError) throw error;
        if (error instanceof ApiError) throw new VoiceError(API_CODES[error.code] ?? 'unknown');
        throw new VoiceError('unknown');
      }
    },

    stop,

    setMuted(value) {
      muted = manual && !holding ? true : value;
      session?.setMuted(muted);
    },

    setPushToTalk(enabled) {
      manual = enabled;
      holding = false;
      muted = enabled;
      session?.send({
        type: 'session.update',
        session: {
          type: 'realtime',
          audio: {
            input: { turn_detection: enabled ? null : { type: 'semantic_vad', eagerness: 'auto' } },
          },
        },
      });
      session?.setMuted(enabled);
    },

    beginTurn() {
      premium?.stop();
      if (stopped || recovering || !manual || holding || !session) return false;
      if (!session.send({ type: 'input_audio_buffer.clear' })) return false;
      session.send({ type: 'response.cancel' });
      session.send({ type: 'output_audio_buffer.clear' });
      holding = true;
      muted = false;
      heldAt = now();
      session.setMuted(false);
      return true;
    },

    endTurn() {
      if (!manual || !holding || !session) return;
      holding = false;
      muted = true;
      session.setMuted(true);
      if (now() - heldAt < MIN_MANUAL_TURN_MS) {
        session.send({ type: 'input_audio_buffer.clear' });
        return;
      }
      if (session.send({ type: 'input_audio_buffer.commit' }))
        session.send({ type: 'response.create' });
    },

    say(text) {
      premium?.stop();
      const item = { type: 'message', role: 'user', content: [{ type: 'input_text', text }] };
      if (!session?.send({ type: 'conversation.item.create', item })) return;
      session.send({ type: 'response.create' });
      typedLines += 1;
      emit({ type: 'learner.typed', id: `typed_${typedLines}`, text });
    },

    help(kind) {
      premium?.stop();
      if (!session) return;
      // Fails harmlessly when nothing is playing: the provider answers with an error event.
      session.send({ type: 'response.cancel' });
      session.send({ type: 'output_audio_buffer.clear' });
      const content = [{ type: 'input_text', text: helpNote(kind) }];
      const item = { type: 'message', role: 'system', content };
      if (!session.send({ type: 'conversation.item.create', item })) return;
      session.send({ type: 'response.create' });
      emit({ type: 'learner.help', kind });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    levels: async () => (session ? session.levels() : SILENCE),
  };
}
