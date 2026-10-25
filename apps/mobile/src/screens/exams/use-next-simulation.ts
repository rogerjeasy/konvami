import { useEffect, useState } from 'react';
import type { NextSimulation } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { usePracticeServices } from '@/practice/services';

export type NextSimulationState =
  | { phase: 'loading' }
  | { phase: 'ready'; data: NextSimulation }
  | { phase: 'failed'; code: string };

/**
 * The cards of the learner's next simulation of a speaking test, read once per `attempt`: the
 * preparation and the test itself show the same ones, as the server chooses them from the
 * simulations done before.
 */
export function useNextSimulation(exam: string, attempt = 0): NextSimulationState {
  const { readNextSimulation } = usePracticeServices();
  // The answer, with the request it answers: one for an earlier request reads as loading.
  const key = `${exam}:${attempt}`;
  const [found, setFound] = useState<{ key: string; state: NextSimulationState } | null>(null);
  useEffect(() => {
    let current = true;
    readNextSimulation(exam).then(
      (data) => current && setFound({ key, state: { phase: 'ready', data } }),
      (error: unknown) =>
        current && setFound({ key, state: { phase: 'failed', code: apiErrorCode(error) } }),
    );
    return () => {
      current = false;
    };
  }, [exam, key, readNextSimulation]);
  return found?.key === key ? found.state : { phase: 'loading' };
}
