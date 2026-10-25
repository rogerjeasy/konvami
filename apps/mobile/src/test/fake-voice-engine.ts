import type { CallPlan, CallPurpose } from '@konvami/api-client';
import { VoiceError, type VoiceEngine, type VoiceErrorCode } from '@/voice/engine';
import type { HelpKind } from '@/voice/help';

/**
 * A `VoiceEngine` for tests: no microphone and no network. A test plays the call by emitting
 * the provider's events, and can make the next start fail or hold it to observe "connecting".
 */
export interface FakeVoiceEngine extends VoiceEngine {
  emit(event: unknown): void;
  failNextStart(code: VoiceErrorCode): void;
  /** Makes the next start wait until the returned function is called. */
  holdStart(): () => void;
  /** The plan the next calls report (none by default, as for the guide's calls). */
  plan: CallPlan | null;
  readonly starts: number;
  readonly stops: number;
  readonly muted: boolean;
  /** Every line said through `say`, in order. */
  readonly said: readonly string[];
  /** Every kind of help asked for through `help`, in order. */
  readonly helped: readonly HelpKind[];
  /** What each call that used this engine was for (filled by the test renderer). */
  readonly openedFor: CallPurpose[];
  /** The partner each of those calls was with; undefined for the guide's calls. */
  readonly openedWith: (string | undefined)[];
  /** The role-play each of those calls rehearsed; undefined for free talk. */
  readonly openedScenarios: (string | undefined)[];
  /** The grammar topic each of those calls practised first; undefined for none. */
  readonly openedPractise: (string | undefined)[];
}

/** The id and the time limit every call of the fake engine reports. */
export const FAKE_CALL_ID = 'rtc_fake';
export const FAKE_MAX_SECONDS = 600;

export function createFakeVoiceEngine(): FakeVoiceEngine {
  const listeners = new Set<(event: unknown) => void>();
  let failure: VoiceErrorCode | null = null;
  let gate: Promise<void> = Promise.resolve();
  const state = { starts: 0, stops: 0, muted: false };
  const said: string[] = [];
  const helped: HelpKind[] = [];
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
    helped,
    plan: null,
    openedFor: [],
    openedWith: [],
    openedScenarios: [],
    openedPractise: [],
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
      return { callId: FAKE_CALL_ID, maxSeconds: FAKE_MAX_SECONDS, plan: this.plan };
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
    help(kind) {
      helped.push(kind);
      emit({ type: 'learner.help', kind });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    levels: async () => ({ persona: 0.2, learner: 0.05 }),
  };
}
