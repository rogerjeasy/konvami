import type { CallPurpose } from '@konvami/api-client';
import { VoiceError, type VoiceEngine, type VoiceErrorCode } from '@/voice/engine';

/**
 * A `VoiceEngine` for tests: no microphone and no network. A test plays the call by emitting
 * the provider's events, and can make the next start fail or hold it to observe "connecting".
 */
export interface FakeVoiceEngine extends VoiceEngine {
  emit(event: unknown): void;
  failNextStart(code: VoiceErrorCode): void;
  /** Makes the next start wait until the returned function is called. */
  holdStart(): () => void;
  readonly starts: number;
  readonly stops: number;
  readonly muted: boolean;
  /** Every line said through `say`, in order. */
  readonly said: readonly string[];
  /** What each call that used this engine was for (filled by the test renderer). */
  readonly openedFor: CallPurpose[];
}

export function createFakeVoiceEngine(): FakeVoiceEngine {
  const listeners = new Set<(event: unknown) => void>();
  let failure: VoiceErrorCode | null = null;
  let gate: Promise<void> = Promise.resolve();
  const state = { starts: 0, stops: 0, muted: false };
  const said: string[] = [];
  const emit = (event: unknown) => listeners.forEach((listener) => listener(event));
  return {
    get starts() {
      return state.starts;
    },
    get stops() {
      return state.stops;
    },
    get muted() {
      return state.muted;
    },
    said,
    openedFor: [],
    emit,
    failNextStart: (code) => void (failure = code),
    holdStart() {
      let release = () => {};
      gate = new Promise((resolve) => (release = resolve));
      return release;
    },
    async start() {
      state.starts += 1;
      await gate;
      if (failure) {
        const code = failure;
        failure = null;
        throw new VoiceError(code);
      }
      return { maxSeconds: 480 };
    },
    stop() {
      state.stops += 1;
    },
    setMuted(muted) {
      state.muted = muted;
    },
    say(text) {
      said.push(text);
      emit({ type: 'learner.typed', id: `typed_${said.length}`, text });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    levels: async () => ({ persona: 0.2, learner: 0.05 }),
  };
}
