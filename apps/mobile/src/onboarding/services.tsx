import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useSession } from '@/auth';
import type { OnboardingState, OnboardingStore } from './store';

const OnboardingContext = createContext<OnboardingStore | null>(null);

/**
 * Provides the onboarding store to every screen and empties it when the user signs out, so one
 * account never sees another's answers on a shared device.
 */
export function OnboardingProvider({
  store,
  children,
}: {
  store: OnboardingStore;
  children: ReactNode;
}) {
  const { status } = useSession();
  useEffect(() => {
    if (status === 'signedOut') store.reset();
  }, [status, store]);
  return <OnboardingContext.Provider value={store}>{children}</OnboardingContext.Provider>;
}

export function useOnboardingStore(): OnboardingStore {
  const store = useContext(OnboardingContext);
  if (!store) throw new Error('useOnboardingStore must be used inside OnboardingProvider');
  return store;
}

/** The onboarding data; re-renders when it changes. */
export function useOnboarding(): OnboardingState {
  const store = useOnboardingStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
