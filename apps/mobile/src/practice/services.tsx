import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type {
  AnsweredCard,
  ApiClient,
  Card,
  Catalog,
  GrammarMap,
  GrammarTopicPage,
  Retried,
  Retries,
  Scenario,
  SpokenRecording,
  CardSource,
  Progress,
  Transcript,
  TutorQuestion,
} from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import type { ClipPlayer } from '@/lib/clip-player';
import type { SentenceRecording } from '@/voice/sentence-recorder';
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
  /** What can be learned and practised: here, the role-plays of each language (5.13). */
  catalog: ResourceStore<Catalog>;
  /** The questions asked to the Tutor, newest first (5.12). */
  tutor: ResourceStore<{ questions: TutorQuestion[] }>;
  /**
   * Says correction `index` of a conversation's report again, from a recording ("Say it better").
   * Rejects with an `ApiError` (`unsure`, `retry_limit`, …).
   */
  retryCorrection: (
    conversationId: string,
    index: number,
    recording: SentenceRecording,
  ) => Promise<Retried>;
  /** The corrections of a conversation's report the learner said again, and whether right. */
  readRetries: (conversationId: string) => Promise<Retries>;
  /** Where a card's sound plays from (made the first time). Rejects with an `ApiError`. */
  cardSound: (id: string) => Promise<string>;
  /**
   * Answers a card out loud, from a recording; the card is not rated. Rejects with an `ApiError`
   * (`answer_limit`, `consent_required`, …).
   */
  answerCard: (id: string, recording: SentenceRecording) => Promise<AnsweredCard>;
  /** The grammar map (5.14). */
  grammar: ResourceStore<GrammarMap>;
  /** One topic of the map (5.15). Rejects with an `ApiError` (`not_found`, …). */
  readGrammarTopic: (id: string) => Promise<GrammarTopicPage>;
  /**
   * Asks the Tutor, about a typed question or about correction `index` of a report, and puts
   * the answer first. Rejects with an `ApiError` (`tutor_limit`, `unavailable`, …).
   */
  askTutor: (
    asked: { question: string } | { conversationId: string; index: number },
  ) => Promise<TutorQuestion>;
  clock: DeviceClock;
  /** Plays a conversation's recordings (and, in Persona Studio, a voice's sample). */
  clips: ClipPlayer;
}

/** A recording as the server takes it. */
const spoken = (recording: SentenceRecording): SpokenRecording => ({
  audio: recording.base64,
  format: recording.format,
  durationMs: recording.durationMs,
});

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
    | 'getTutorQuestions'
    | 'getCatalog'
    | 'askTutor'
    | 'explainCorrection'
    | 'getGrammarMap'
    | 'getGrammarTopic'
    | 'retryCorrection'
    | 'getRetries'
    | 'getCardAudio'
    | 'answerCard'
  >,
  clock: DeviceClock,
  clips: ClipPlayer,
): PracticeServices {
  const home = createHomeStore(api, clock);
  const deck = createDeckStore(api);
  const tutor = createResourceStore(() => api.getTutorQuestions(), clock.now);
  const catalog = createResourceStore(() => api.getCatalog(), clock.now);
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
    catalog,
    tutor,
    grammar: createResourceStore(() => api.getGrammarMap(), clock.now),
    readGrammarTopic: (id) => api.getGrammarTopic(id),
    cardSound: async (id) => (await api.getCardAudio(id)).url,
    retryCorrection: (conversationId, index, recording) =>
      api.retryCorrection(conversationId, index, spoken(recording)),
    answerCard: (id, recording) => api.answerCard(id, spoken(recording)),
    readRetries: (conversationId) => api.getRetries(conversationId),
    askTutor: (asked) =>
      tutor.mutate(
        () =>
          'question' in asked
            ? api.askTutor(asked.question)
            : api.explainCorrection(asked.conversationId, asked.index),
        (shown, answer) => ({ questions: [answer, ...shown.questions] }),
      ),
    clock,
    clips,
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
    services.tutor.reset();
    services.grammar.reset();
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

/**
 * The partner Today suggests talking to, for a screen that starts a conversation of its own
 * (a grammar topic, a review conversation); null until it is known, or with no partner.
 */
export function useSuggestedPartner(): string | null {
  const { home: store } = usePracticeServices();
  const home = useHome();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);
  return home.phase === 'ready' ? home.data.suggestedPartnerId : null;
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

/** The grammar map; re-renders when it changes. */
export function useGrammarMap(): ResourceState<GrammarMap> {
  const { grammar } = usePracticeServices();
  return useSyncExternalStore(grammar.subscribe, grammar.getState, grammar.getState);
}

export type TopicReading =
  | { phase: 'loading' }
  | { phase: 'failed'; code: string }
  | { phase: 'ready'; page: GrammarTopicPage };

/** Reads one topic of the grammar map; `retry` reads it again after a failure. */
export function useGrammarTopic(id: string): TopicReading & { retry: () => void } {
  const { readGrammarTopic } = usePracticeServices();
  const [reading, setReading] = useState<TopicReading>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    readGrammarTopic(id).then(
      (page) => current && setReading({ phase: 'ready', page }),
      (error: unknown) => current && setReading({ phase: 'failed', code: apiErrorCode(error) }),
    );
    return () => {
      current = false;
    };
  }, [readGrammarTopic, id, attempt]);

  return {
    ...reading,
    retry: () => {
      setReading({ phase: 'loading' });
      setAttempt((count) => count + 1);
    },
  };
}

/** The questions asked to the Tutor; re-renders when they change. */
export function useTutor(): ResourceState<{ questions: TutorQuestion[] }> {
  const { tutor } = usePracticeServices();
  return useSyncExternalStore(tutor.subscribe, tutor.getState, tutor.getState);
}

export interface ScenarioReading {
  phase: 'loading' | 'ready' | 'failed';
  /** Null until ready. */
  scenarios: Scenario[] | null;
  /** Reads both again after a failure. */
  retry: () => void;
}

/**
 * The role-plays of the language the learner is learning (from Today's data and the catalog),
 * easiest first; null until both are read. Reads them when first asked.
 */
export function useScenarios(): ScenarioReading {
  const { catalog: store, home: homeStore } = usePracticeServices();
  const catalog = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const home = useHome();
  useEffect(() => {
    void store.load();
    void homeStore.load();
  }, [store, homeStore]);
  const language = home.phase === 'ready' ? home.data.language : null;
  const scenarios =
    catalog.phase === 'ready' && language
      ? (catalog.data.languages.find((l) => l.code === language)?.scenarios ?? [])
      : null;
  const phase =
    catalog.phase === 'failed' || home.phase === 'failed'
      ? 'failed'
      : scenarios
        ? 'ready'
        : 'loading';
  return {
    phase,
    scenarios,
    retry: () => {
      void store.reload();
      void homeStore.reload();
    },
  };
}
