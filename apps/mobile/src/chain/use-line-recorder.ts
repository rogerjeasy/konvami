import { useEffect, useRef, useState } from 'react';
import { apiErrorCode } from '@/api/messages';
import { commitFeedback } from '@/lib/haptics';
import {
  RecorderError,
  useSentenceRecorder,
  type SentenceRecording,
} from '@/voice/sentence-recorder';

// A line of the story is at most 45 seconds; the recorder stops by itself there (ms).
export const MAX_LINE_MS = 45_000;

export type LineStep =
  | { kind: 'ready' }
  | { kind: 'recording' }
  /** Recorded and kept on the phone: to listen to, record again or send. */
  | { kind: 'recorded'; recording: SentenceRecording }
  | { kind: 'sending'; recording: SentenceRecording }
  | { kind: 'sent' }
  /** `code` is the recorder's (`mic_denied`) or the server's (`too_short`, `limit`, …). */
  | { kind: 'failed'; code: string; recording?: SentenceRecording };

/**
 * One line of the story chain (9.4), recorded and kept until the learner sends it: unlike
 * "Say it better", a line is listened to first and can be said again, since others will hear it.
 */
export function useLineRecorder(send: (recording: SentenceRecording) => Promise<unknown>) {
  const recorder = useSentenceRecorder();
  const [step, setStep] = useState<LineStep>({ kind: 'ready' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const recording = await recorder.stop().catch(() => null);
    setStep(recording ? { kind: 'recorded', recording } : { kind: 'failed', code: 'unavailable' });
  }

  async function record() {
    commitFeedback();
    try {
      await recorder.start();
      setStep({ kind: 'recording' });
      timer.current = setTimeout(() => void stop(), MAX_LINE_MS);
    } catch (error) {
      setStep({
        kind: 'failed',
        code: error instanceof RecorderError ? error.code : 'unavailable',
      });
    }
  }

  async function submit() {
    if (step.kind !== 'recorded' && !(step.kind === 'failed' && step.recording)) return;
    const recording = step.recording;
    if (!recording) return;
    commitFeedback();
    setStep({ kind: 'sending', recording });
    try {
      await send(recording);
      setStep({ kind: 'sent' });
    } catch (error) {
      setStep({ kind: 'failed', code: apiErrorCode(error), recording });
    }
  }

  return { step, record, stop, submit, reset: () => setStep({ kind: 'ready' }) };
}
