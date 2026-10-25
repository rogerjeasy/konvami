import {
  RecorderError,
  type SentenceRecorder,
  type SentenceRecording,
} from '@/voice/sentence-recorder';

/** What every recording of the fake recorder is. */
export const FAKE_RECORDING: SentenceRecording = {
  base64: 'AAEC',
  format: 'm4a',
  durationMs: 2400,
  uri: 'file:///fake/attempt.m4a',
};

/** A `SentenceRecorder` for tests: no microphone; it can refuse to start. */
export interface FakeRecorder extends SentenceRecorder {
  failNextStart(code: RecorderError['code']): void;
  readonly starts: number;
}

export function createFakeRecorder(): FakeRecorder {
  let failure: RecorderError['code'] | null = null;
  const state = { starts: 0 };
  return {
    get starts() {
      return state.starts;
    },
    failNextStart: (code) => void (failure = code),
    async start() {
      if (failure) {
        const code = failure;
        failure = null;
        throw new RecorderError(code);
      }
      state.starts += 1;
    },
    stop: async () => FAKE_RECORDING,
  };
}
