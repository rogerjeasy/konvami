import { useEffect, useRef, useState } from 'react';
import { apiErrorCode } from '@/api/messages';
import { commitFeedback } from '@/lib/haptics';
import { RecorderError, useSentenceRecorder, type SentenceRecording } from './sentence-recorder';

// A sentence takes seconds to say; a recording left running stops by itself after this (ms).
export const MAX_RECORDING_MS = 20_000;

export type SpokenStep<T> =
  | { kind: 'ready' }
  | { kind: 'recording' }
  | { kind: 'checking' }
  | { kind: 'heard'; result: T; recording: SentenceRecording }
  /** `code` is a recorder's (`mic_denied`, …) or the server's (`answer_limit`, …). */
  | { kind: 'failed'; code: string };

/**
 * One sentence said on purpose and checked by the server: "Say it better" (spec §6.5) and a card
 * answered out loud (spec §6.7). `record` starts the microphone; `stop`, or the time running
 * out, sends the recording to `check`; `onHeard` runs once with what came back.
 */
export function useSpokenAttempt<T>(
  check: (recording: SentenceRecording) => Promise<T>,
  onHeard?: (result: T) => void,
) {
  const recorder = useSentenceRecorder();
  const [step, setStep] = useState<SpokenStep<T>>({ kind: 'ready' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A recording stopped by its timer checks with what the screen shows then, not at its start.
  const latest = useRef({ check, onHeard });
  useEffect(() => {
    latest.current = { check, onHeard };
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setStep({ kind: 'checking' });
    try {
      const recording = await recorder.stop();
      if (!recording) {
        setStep({ kind: 'failed', code: 'unavailable' });
        return;
      }
      const result = await latest.current.check(recording);
      latest.current.onHeard?.(result);
      setStep({ kind: 'heard', result, recording });
    } catch (error) {
      setStep({ kind: 'failed', code: apiErrorCode(error) });
    }
  }

  async function record() {
    commitFeedback();
    try {
      await recorder.start();
      setStep({ kind: 'recording' });
      timer.current = setTimeout(() => void stop(), MAX_RECORDING_MS);
    } catch (error) {
      setStep({
        kind: 'failed',
        code: error instanceof RecorderError ? error.code : 'unavailable',
      });
    }
  }

  return { step, record, stop, reset: () => setStep({ kind: 'ready' }) };
}
