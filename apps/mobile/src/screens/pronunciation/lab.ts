import { useEffect, useState } from 'react';
import type { PronunciationDrill, PronunciationSoundDetail } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { usePracticeServices } from '@/practice/services';

/** One thing to say in the lab: what to say, how, and which texts can be heard first. */
export interface LabDrill {
  kind: PronunciationDrill;
  /** The sound it practises; null for one of the learner's problem words. */
  soundId: string | null;
  /** The text to say: a word, the two words of a pair, or a sentence. */
  target: string;
  /** The texts that play before saying it (a pair's two words, or the sentence). */
  listen: readonly string[];
}

/** Why a request did not complete, as a message key; any other reason reads as unavailable. */
export function labFailureKey(code: string) {
  switch (code) {
    case 'mic_denied':
      return 'conversation.problems.mic_denied';
    case 'drill_limit':
      return 'pronunciation.failed.limit';
    case 'consent_required':
      return 'pronunciation.failed.consent';
    case 'network':
      return 'errors.network';
    default:
      return 'pronunciation.failed.unavailable';
  }
}

export type SoundReading =
  | { phase: 'loading' }
  | { phase: 'failed'; code: string }
  | { phase: 'ready'; detail: PronunciationSoundDetail };

/** Reads one sound of the lab, again after the practice changes; `retry` reads it after a failure. */
export function useSoundDetail(id: string): SoundReading & { retry: () => void } {
  const { readPronunciationSound, pronunciation } = usePracticeServices();
  const [reading, setReading] = useState<SoundReading>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    readPronunciationSound(id).then(
      (detail) => current && setReading({ phase: 'ready', detail }),
      (error: unknown) => current && setReading({ phase: 'failed', code: apiErrorCode(error) }),
    );
    return () => {
      current = false;
    };
  }, [readPronunciationSound, id, attempt]);

  // The lab's store is read again after every drill: so are the sound's tallies.
  useEffect(
    () =>
      pronunciation.subscribe(() => {
        const lab = pronunciation.getState();
        if (lab.phase !== 'ready' || lab.refreshing) return;
        readPronunciationSound(id).then(
          (detail) => setReading({ phase: 'ready', detail }),
          () => {},
        );
      }),
    [pronunciation, readPronunciationSound, id],
  );

  return {
    ...reading,
    retry: () => {
      setReading({ phase: 'loading' });
      setAttempt((n) => n + 1);
    },
  };
}
