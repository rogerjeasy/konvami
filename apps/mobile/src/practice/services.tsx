import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { ApiClient, Card, CardSource, Progress, Transcript } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { createDeckStore, type DeckState, type DeckStore } from './deck-store';
import { createHomeStore, type HomeState, type HomeStore } from './home-store';
import { createLibraryStore, type LibraryState, type LibraryStore } from './library-store';
import { createReportFollower, type ReportFollower, type ReportView } from './report-follower';
import { createResourceStore, type ResourceState, type ResourceStore } from './resource-store';
import { createReviewSession, type ReviewSession, type ReviewState } from './review-session';

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
  /** What the Progress screen charts. */
  progress: ResourceStore<Progress>;
  /** The learner's flashcards. */
  deck: DeckStore;
  /**
   * Makes a flashcard of a word or a correction in a report, then brings the deck and Today's
   * count of due cards up to date. Rejects with an `ApiError` (`too_many`, `network`, …).
   */
  saveCard: (source: CardSource) => Promise<Card>;
  /** One sitting of reviewing the cards that are due. */
  reviewCards: () => ReviewSession;
  clock: DeviceClock;
}

export function createPracticeServices(
  api: Pick<
    ApiClient,
    | 'getHome'
    | 'getProgress'
    | 'getConversations'
    | 'getConversation'
    | 'getConversationReport'
    | 'requestConversationReport'
    | 'saveCard'
    | 'getCards'
    | 'getDueCards'
    | 'reviewCard'
    | 'removeCard'
  >,
  clock: DeviceClock,
): PracticeServices {
  const home = createHomeStore(api, clock);
  const deck = createDeckStore(api);
  return {
    home,
    progress: createResourceStore(() => api.getProgress(clock.timeZone()), clock.now),
    library: createLibraryStore(api),
    readConversation: (id) => api.getConversation(id),
    followReport: (id) => createReportFollower(api, id),
    deck,
    async saveCard(source) {
      const card = await api.saveCard(source);
      void deck.refresh();
      void home.refresh();
      return card;
    },
    reviewCards: () => createReviewSession(api),
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
    services.deck.reset();
    services.progress.reset();
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

/** What the Progress screen charts; re-renders when it changes. */
export function useProgress(): ResourceState<Progress> {
  const { progress } = usePracticeServices();
  return useSyncExternalStore(progress.subscribe, progress.getState, progress.getState);
}

/** The learner's flashcards; re-renders when they change. */
export function useDeck(): DeckState {
  const { deck } = usePracticeServices();
  return useSyncExternalStore(deck.subscribe, deck.getState, deck.getState);
}

/**
 * One sitting of flashcard review, for as long as the screen that started it is open. When it
 * is done, the deck and Today's count of due cards are read again.
 */
export function useReviewSession(): { state: ReviewState; session: ReviewSession } {
  const { reviewCards, deck, home } = usePracticeServices();
  const session = useMemo(() => reviewCards(), [reviewCards]);
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  useEffect(() => void session.start(), [session]);
  const done = state.phase === 'done';
  useEffect(() => {
    if (!done) return;
    void deck.refresh();
    void home.refresh();
  }, [done, deck, home]);
  return { state, session };
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
