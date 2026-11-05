import { useCallback, useEffect, useState } from 'react';
import type { PenPalThread } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { usePracticeServices } from '@/practice/services';

// How often a thread is read again while a note or an answer is being written (ms): the worker
// takes a few seconds to write and speak one, so this is not an exercise in patience.
export const POLL_MS = 3000;

export type ThreadState =
  | { phase: 'loading' }
  | { phase: 'failed'; code: string }
  | { phase: 'ready'; thread: PenPalThread };

const LOADING: ThreadState = { phase: 'loading' };

/**
 * One partner's pen-pal thread. It is read again while any note in it is pending, so a note the
 * worker is writing turns into the finished one on its own; `refresh` reads it at once (after
 * the learner sent a voice note or asked for one). A failure while reading again keeps what
 * is shown, and another partner's thread starts from nothing.
 */
export function usePenPalThread(personaId: string | null): {
  state: ThreadState;
  refresh: () => void;
} {
  const { readPenPalThread } = usePracticeServices();
  // What was read, and for which partner: a thread of another partner is not shown for this one.
  const [read, setRead] = useState<{ personaId: string; state: ThreadState } | null>(null);
  const [tick, setTick] = useState(0);
  const state = read && read.personaId === personaId ? read.state : LOADING;

  useEffect(() => {
    if (!personaId) return;
    let current = true;
    readPenPalThread(personaId).then(
      (thread) => current && setRead({ personaId, state: { phase: 'ready', thread } }),
      (error: unknown) =>
        current &&
        setRead((shown) =>
          shown?.personaId === personaId && shown.state.phase === 'ready'
            ? shown
            : { personaId, state: { phase: 'failed', code: apiErrorCode(error) } },
        ),
    );
    return () => {
      current = false;
    };
  }, [readPenPalThread, personaId, tick]);

  const waiting = state.phase === 'ready' && state.thread.notes.some((n) => n.status === 'pending');
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setTick((count) => count + 1), POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, tick]);

  const refresh = useCallback(() => setTick((count) => count + 1), []);
  return { state, refresh };
}
