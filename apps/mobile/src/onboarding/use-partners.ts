import { useEffect, useState } from 'react';
import { apiErrorCode } from '@/api/messages';
import { useOnboardingStore } from './services';

/**
 * Makes sure the learner's partners are in the store: `propose` asks the server for the starter
 * partners (written on the first call), `read` only reads the ones they have. Returns why that
 * failed, if it did, and a way to try again. The partners themselves come from `useOnboarding`.
 */
export function usePartners(mode: 'propose' | 'read'): {
  failure: string | null;
  retry: () => void;
} {
  const store = useOnboardingStore();
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Already there (coming back from editing one of them): nothing to ask for.
    if (store.getState().data?.partners) return;
    let current = true;
    const load = mode === 'propose' ? store.proposePartners() : store.loadPartners();
    load.catch((error: unknown) => {
      if (current) setFailure(apiErrorCode(error));
    });
    return () => {
      current = false;
    };
  }, [store, mode, attempt]);

  return {
    failure,
    retry: () => {
      setFailure(null);
      setAttempt((count) => count + 1);
    },
  };
}
