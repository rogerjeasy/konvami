import { ApiError, type VoiceCall } from '@konvami/api-client';
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
   * Sets the call up and returns its id and the time after which the server ends it. Rejects
   * with a `VoiceError`; nothing is left open when it does.
   */
  start(): Promise<{ callId: string; maxSeconds: number }>;
  /** Ends the call and frees the microphone. Safe to call at any time, any number of times. */
  stop(): void;
  setMuted(muted: boolean): void;
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

/** Failures of the call-creating request that mean the same on the voice screen. */
const API_CODES: Record<string, VoiceErrorCode> = {
  consent_required: 'consent_required',
  call_limit: 'call_limit',
  voice_unavailable: 'voice_unavailable',
  not_configured: 'voice_unavailable',
  waking_up: 'voice_unavailable',
  network: 'network',
};

const SILENCE: AudioLevels = { persona: 0, learner: 0 };

export function createVoiceEngine({
  createSession,
  startCall,
}: {
  /** A WebRTC session for this platform, or null when the build has none. */
  createSession: () => RtcSession | null;
  /** Trades the SDP offer for the server's answer (`api.startVoiceCall`). */
  startCall: (sdpOffer: string) => Promise<VoiceCall>;
}): VoiceEngine {
  let session: RtcSession | null = null;
  let stopped = false;
  let typedLines = 0;
  const listeners = new Set<(event: unknown) => void>();
  const emit = (event: unknown) => listeners.forEach((listener) => listener(event));

  function stop() {
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
      next.onEvent(emit);
      next.onClosed(() => emit({ type: 'connection.lost' }));
      try {
        const offer = await next.offer();
        const call = await startCall(offer);
        if (stopped) throw new VoiceError('stopped');
        await next.accept(call.sdp);
        return { callId: call.callId, maxSeconds: call.maxSeconds };
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

    say(text) {
      const item = { type: 'message', role: 'user', content: [{ type: 'input_text', text }] };
      if (!session?.send({ type: 'conversation.item.create', item })) return;
      session.send({ type: 'response.create' });
      typedLines += 1;
      emit({ type: 'learner.typed', id: `typed_${typedLines}`, text });
    },

    help(kind) {
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
