import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { ApiClient, Transcript } from '@konvami/api-client';
import { useSession } from '@/auth';
import { createHomeStore, type HomeState, type HomeStore } from './home-store';
import { createLibraryStore, type LibraryState, type LibraryStore } from './library-store';

/** What the device tells the app about time. Replaced in tests. */
export interface DeviceClock {
  /** The device's time zone as an IANA name, when it can say. */
  timeZone: () => string | undefined;
  /** Milliseconds since the epoch. */
  now: () => number;
}

/**
 * Everything the app's own screens (Today, Talk, Library, a conversation) need from the
 * backend: what Today shows, the list of past conversations, and one conversation by its id.
 */
export interface PracticeServices {
  home: HomeStore;
  library: LibraryStore;
  /** One conversation with what was said in it. Rejects with an `ApiError` (`not_found`, …). */
  readConversation: (id: string) => Promise<Transcript>;
  clock: DeviceClock;
}

export function createPracticeServices(
  api: Pick<ApiClient, 'getHome' | 'getConversations' | 'getConversation'>,
  clock: DeviceClock,
): PracticeServices {
  return {
    home: createHomeStore(api, clock),
    library: createLibraryStore(api),
    readConversation: (id) => api.getConversation(id),
    clock,
  };
}

const PracticeContext = createContext<PracticeServices | null>(null);

/**
 * Provides the practice services to every screen and empties their stores when the user signs
 * out, so one account never sees another's conversations on a shared device.
 */
export function PracticeProvider({
  services,
  children,
}: {
  services: PracticeServices;
  children: ReactNode;
}) {
  const { status } = useSession();
  useEffect(() => {
    if (status !== 'signedOut') return;
    services.home.reset();
    services.library.reset();
  }, [status, services]);
  return <PracticeContext.Provider value={services}>{children}</PracticeContext.Provider>;
}

export function usePracticeServices(): PracticeServices {
  const services = useContext(PracticeContext);
  if (!services) throw new Error('usePracticeServices must be used inside PracticeProvider');
  return services;
}

/** What Today and Talk show; re-renders when it changes. */
export function useHome(): HomeState {
  const { home } = usePracticeServices();
  return useSyncExternalStore(home.subscribe, home.getState, home.getState);
}

/** The list of past conversations; re-renders when it changes. */
export function useLibrary(): LibraryState {
  const { library } = usePracticeServices();
  return useSyncExternalStore(library.subscribe, library.getState, library.getState);
}
