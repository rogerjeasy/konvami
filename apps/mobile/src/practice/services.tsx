import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { ApiClient, Transcript } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { createHomeStore, type HomeState, type HomeStore } from './home-store';
import { createLibraryStore, type LibraryState, type LibraryStore } from './library-store';
import { createReportFollower, type ReportFollower, type ReportView } from './report-follower';

/** What the device tells the app about time. Replaced in tests. */
export interface DeviceClock {
  /** The device's time zone as an IANA name, when it can say. */
  timeZone: () => string | undefined;
  /** Milliseconds since the epoch. */
  now: () => number;
}

/**
 * Everything the app's own screens (Today, Talk, Library, a conversation) need from the
 * backend: what Today shows, the list of past conversations, one conversation by its id and
 * the report on it.
 */
export interface PracticeServices {
  home: HomeStore;
  library: LibraryStore;
  /** One conversation with what was said in it. Rejects with an `ApiError` (`not_found`, …). */
  readConversation: (id: string) => Promise<Transcript>;
  /** Follows one conversation's report for as long as a screen shows it. */
  followReport: (id: string) => ReportFollower;
  clock: DeviceClock;
}

export function createPracticeServices(
  api: Pick<
    ApiClient,
    | 'getHome'
    | 'getConversations'
    | 'getConversation'
    | 'getConversationReport'
    | 'requestConversationReport'
  >,
  clock: DeviceClock,
): PracticeServices {
  return {
    home: createHomeStore(api, clock),
    library: createLibraryStore(api),
    readConversation: (id) => api.getConversation(id),
    followReport: (id) => createReportFollower(api, id),
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

export type ConversationReading =
  | { phase: 'loading' }
  | { phase: 'failed'; code: string }
  | { phase: 'ready'; transcript: Transcript };

/** Reads one conversation; `retry` reads it again after a failure. */
export function useConversation(id: string): ConversationReading & { retry: () => void } {
  const { readConversation } = usePracticeServices();
  const [reading, setReading] = useState<ConversationReading>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    readConversation(id).then(
      (transcript) => current && setReading({ phase: 'ready', transcript }),
      (error: unknown) => current && setReading({ phase: 'failed', code: apiErrorCode(error) }),
    );
    return () => {
      current = false;
    };
  }, [readConversation, id, attempt]);

  return {
    ...reading,
    retry: () => {
      setReading({ phase: 'loading' });
      setAttempt((count) => count + 1);
    },
  };
}

/**
 * The report on one conversation, followed while it is being written. `request` asks the
 * server to write it (again); `reload` reads it again after it could not be read.
 */
export function useReport(id: string): {
  view: ReportView;
  request: () => void;
  reload: () => void;
} {
  const { followReport } = usePracticeServices();
  const follower = useMemo(() => followReport(id), [followReport, id]);
  useEffect(() => {
    follower.start();
    return () => follower.stop();
  }, [follower]);
  const view = useSyncExternalStore(follower.subscribe, follower.getState, follower.getState);
  return { view, request: () => void follower.request(), reload: follower.start };
}
