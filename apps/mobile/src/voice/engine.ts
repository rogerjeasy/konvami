import { ApiError, type CallPlan, type VoiceCall } from '@konvami/api-client';
import type { ClipPlayer } from '@/lib/clip-player';
import { premiumPlayback } from './premium-playback';
import { VoiceError, type VoiceErrorCode } from './errors';
import type { AudioLevels, RtcSession } from './rtc-session';
import { helpNote, type HelpKind } from './help';

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
  beginTurn(): void;
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
  clips,
  now = Date.now,
}: {
  /** A WebRTC session for this platform, or null when the build has none. */
  createSession: () => RtcSession | null;
  clips?: ClipPlayer;
  now?: () => number;
  /** Trades the SDP offer for the server's answer (`api.startVoiceCall`). */
  startCall: (sdpOffer: string) => Promise<VoiceCall>;
}): VoiceEngine {
  let session: RtcSession | null = null;
  let stopped = false;
  let typedLines = 0;
  let manual = false;
  let holding = false;
  let heldAt = 0;
  const listeners = new Set<(event: unknown) => void>();
  const emit = (event: unknown) => listeners.forEach((listener) => listener(event));

  const premium = clips ? premiumPlayback(clips, emit) : null;

  function stop() {
    premium?.stop();
    stopped = true;
    session?.close();
    session = null;
  }

  return {
    async start() {
      stopped = false;
      const next = createSession();
      if (!next) throw new VoiceError('unsupported');
      session = next;
      next.onEvent((event) => {
        premium?.handle(event);
        emit(event);
      });
      next.onClosed(() => emit({ type: 'connection.lost' }));
      try {
        const offer = await next.offer();
        const call = await startCall(offer);
        if (stopped) throw new VoiceError('stopped');
        await next.accept(call.sdp);
        return { callId: call.callId, maxSeconds: call.maxSeconds, plan: call.plan };
      } catch (error) {
        next.close();
        if (session === next) session = null;
        if (error instanceof VoiceError) throw error;
        if (error instanceof ApiError) throw new VoiceError(API_CODES[error.code] ?? 'unknown');
        throw new VoiceError('unknown');
      }
    },

    stop,

    setMuted(muted) {
      session?.setMuted(muted);
    },

    setPushToTalk(enabled) {
      if (!session) return;
      const sent = session.send({
        type: 'session.update',
        session: {
          type: 'realtime',
          audio: {
            input: { turn_detection: enabled ? null : { type: 'semantic_vad', eagerness: 'auto' } },
          },
        },
      });
      if (!sent) return;
      manual = enabled;
      holding = false;
      session.setMuted(enabled);
    },

    beginTurn() {
      premium?.stop();
      if (!manual || holding || !session) return;
      if (!session.send({ type: 'input_audio_buffer.clear' })) return;
      session.send({ type: 'response.cancel' });
      session.send({ type: 'output_audio_buffer.clear' });
      holding = true;
      heldAt = now();
      session.setMuted(false);
    },

    endTurn() {
      if (!manual || !holding || !session) return;
      holding = false;
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
