import type { DocumentKind, ImportDocuments } from '@/imports/documents';
import type { LibraryTools } from '@/offline/library';
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
  CourseImport,
  CourseImportDraft,
  CourseImports,
  PushDevice,
  Catalog,
  ExamCentre,
  FeedbackInput,
  FeedbackStatus,
  Flag,
  FlagInput,
  FlagStatus,
  InboxFeedback,
  QueuedFlag,
  NextSimulation,
  GrammarMap,
  GrammarTopicPage,
  Retried,
  Retries,
  Scenario,
  SpokenRecording,
  CardSource,
  Progress,
  Transcript,
  ThenVsNow,
  PenPal,
  PenPalNote,
  PenPalReply,
  PenPalSettings,
  PenPalSettingsChange,
  PenPalThread,
  Phrase,
  PhraseDraft,
  PhraseSuggestion,
  CaptionMeaning,
  ProblemWord,
  PronunciationAttempt,
  PronunciationDrill,
  PronunciationSound,
  PronunciationSoundDetail,
  TutorQuestion,
} from '@konvami/api-client';
import { ApiError } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import type { ImportPhotos } from '@/imports/photos';
import type { ClipPlayer } from '@/lib/clip-player';
import type { SentenceRecording } from '@/voice/sentence-recorder';
import { createDeckStore, type DeckState, type DeckStore } from './deck-store';
import { createHomeStore, type HomeState, type HomeStore } from './home-store';
import { createLibraryStore, type LibraryState, type LibraryStore } from './library-store';
import { createReportFollower, type ReportFollower, type ReportView } from './report-follower';
import { createResourceStore, type ResourceState, type ResourceStore } from './resource-store';
import { createReviewSession, type ReviewSession, type ReviewState } from './review-session';
import { createSimulationFollower, type SimulationFollower } from './simulation-follower';
import { createWeekReviewFollower, type WeekReviewFollower } from './week-review-follower';

/** What the device tells the app about time. Replaced in tests. */
export interface DeviceClock {
  /** The device's time zone as an IANA name, when it can say. */
  timeZone: () => string | undefined;
  /** Milliseconds since the epoch. */
  now: () => number;
}

/** The pronunciation lab (5.22): the problem sounds with the practice so far, and the words missed. */
export interface PronunciationLab {
  assessmentProvider: string | null;
  sounds: PronunciationSound[];
  words: ProblemWord[];
}

/**
 * Everything the app's own screens (Today, Talk, Library, a conversation) need from the
 * backend: what Today shows, the list of past conversations, one conversation by its id and
 * the report on it.
 */
export interface PracticeServices {
  libraryTools?: LibraryTools;
  offline?: { pendingReviews(): Promise<number>; syncReviews(): Promise<void> };
  home: HomeStore;
  library: LibraryStore;
  /** One conversation with what was said in it. Rejects with an `ApiError` (`not_found`, …). */
  readConversation: (id: string) => Promise<Transcript>;
  readRecordingTiming: ApiClient['getRecordingTiming'];
  /** The pair of recorded conversations to hear side by side (5.20). */
  readThenVsNow: () => Promise<ThenVsNow>;
  /** Follows one conversation's report for as long as a screen shows it. */
  followReport: (id: string) => ReportFollower;
  /** What the Progress screen charts. */
  progress: ResourceStore<Progress>;
  /** Asks for the words of last week's check-in (`week` is its Monday) and follows them. */
  followWeekReview: (week: string) => WeekReviewFollower;
  /** Where last week's check-in plays from, in the partner's voice. Rejects with an `ApiError`. */
  weekSound: (week: string) => Promise<string>;
  /** The exam centre (5.16). */
  exams: ResourceStore<ExamCentre>;
  /** The cards of the next simulation of a speaking test. Rejects with an `ApiError`. */
  readNextSimulation: (exam: string) => Promise<NextSimulation>;
  /** Follows a simulation's score while it is written (5.18). */
  followSimulation: (callId: string) => SimulationFollower;
  /** Where a part's model answer plays from. Rejects with an `ApiError`. */
  modelAnswerSound: (callId: string, part: string) => Promise<string>;
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
  /** The learner's phrasebook, newest first (5.19). */
  phrasebook: ResourceStore<{ phrases: Phrase[] }>;
  /**
   * Phrases for a situation; nothing is kept. Rejects with an `ApiError` (`suggestion_limit`,
   * `consent_required`, `unavailable`, …).
   */
  lookupCaption: (language: string, word: string, caption: string) => Promise<CaptionMeaning>;
  saveCaptionWord: (language: string, word: string, meaning: string) => Promise<Card>;
  suggestPhrases: (situation: string) => Promise<PhraseSuggestion[]>;
  /** Keeps a phrase and puts it first in the phrasebook. Rejects with an `ApiError`. */
  keepPhrase: (draft: PhraseDraft) => Promise<Phrase>;
  /**
   * Makes a flashcard of a kept phrase, then brings the deck and Today's count of due cards up to
   * date. Rejects with an `ApiError` (`not_found`, `too_many`, …).
   */
  makePhraseCard: (id: string) => Promise<Card>;
  phraseSound: (id: string) => Promise<string>;
  /** Removes a kept phrase. Rejects with an `ApiError` (`not_found`, …). */
  removePhrase: (id: string) => Promise<void>;
  /** The pronunciation lab (5.22). */
  pronunciation: ResourceStore<PronunciationLab>;
  /** One sound with its pairs, words and sentences. Rejects with an `ApiError` (`not_found`). */
  readPronunciationSound: (id: string) => Promise<PronunciationSoundDetail>;
  /**
   * Where a word or sentence of the lab plays from, in the first partner's voice. Rejects with
   * an `ApiError` (`not_found`, `unavailable`).
   */
  pronunciationSound: (text: string) => Promise<string>;
  /**
   * Says a drill out loud and has it heard word by word; the lab's tallies are read again.
   * `soundId` is null for one of the learner's problem words. Rejects with an `ApiError`
   * (`drill_limit`, `consent_required`, `unavailable`, …).
   */
  assessConversationPronunciation: (
    callId: string,
    turn: number,
    recording: SentenceRecording,
  ) => Promise<PronunciationAttempt>;
  drillPronunciation: (
    drill: {
      drill: PronunciationDrill;
      soundId: string | null;
      target: string;
      assessmentConsent?: boolean;
    },
    recording: SentenceRecording,
  ) => Promise<PronunciationAttempt>;
  /** Which word of a pair was heard; true when right. The lab's tallies are read again. */
  pickPronunciationWord: (soundId: string, played: string, chosen: string) => Promise<boolean>;

  /** What the learner brought (the course companion), newest first (5.23). */
  imports: ResourceStore<CourseImports>;
  /** One import with its words, grammar and sentences. Rejects with an `ApiError` (`not_found`). */
  readImport: (id: string) => Promise<CourseImport>;
  /**
   * Works out a text, a web page or an uploaded photo and puts it in the list. Rejects with an
   * `ApiError` (`import_limit`, `not_in_language`, `blocked`, …).
   */
  bringImport: (draft: CourseImportDraft) => Promise<CourseImport>;
  draftImportReply: (id: string) => Promise<string>;
  bringDocument: (
    kind: DocumentKind,
    book: { textbook?: string | null; chapter?: string | null },
  ) => Promise<CourseImport | null>;
  /**
   * Lets the learner choose a photo, sends it and works it out. Resolves to null when they close
   * the picker; rejects with an `ApiError` (`invalid_photo` when the picture cannot be read).
   */
  bringPhoto: (
    book: {
      textbook?: string | null;
      chapter?: string | null;
    },
    source?: 'library' | 'camera',
  ) => Promise<CourseImport | null>;
  /** Removes an import. Rejects with an `ApiError` (`not_found`, …). */
  removeImport: (id: string) => Promise<void>;
  /**
   * Makes a flashcard of word `index` of an import, then brings the deck and Today's count of
   * due cards up to date. Rejects with an `ApiError` (`not_found`, `too_many`, …).
   */
  makeImportCard: (id: string, index: number) => Promise<Card>;
  /** The questions asked to the Tutor, newest first (5.12). */
  tutor: ResourceStore<{ questions: TutorQuestion[] }>;
  /** The pen-pal settings and a line per partner (5.21, Today's card, Talk's row). */
  penPal: ResourceStore<PenPal>;
  /** One partner's thread of voice notes. Rejects with an `ApiError` (`not_found`, …). */
  readPenPalThread: (personaId: string) => Promise<PenPalThread>;
  /** Changes pen-pal settings and shows them. Rejects with an `ApiError` (`invalid_value`, …). */
  changePenPal: (changes: PenPalSettingsChange) => Promise<PenPalSettings>;
  /** The learner opened a thread: what the partner sent counts as read. */
  openPenPalThread: (personaId: string) => Promise<void>;
  /**
   * Asks a partner for a note now; it is pending until the thread shows it. Rejects with an
   * `ApiError` (`limit`, `consent_required`, …).
   */
  askForPenPalNote: (personaId: string) => Promise<PenPalNote>;
  /**
   * Answers a partner with a recorded voice note; the partner's answer follows. Rejects with an
   * `ApiError` (`too_short`, `limit`, `consent_required`, …).
   */
  sendPenPalReply: (personaId: string, recording: SentenceRecording) => Promise<PenPalReply>;
  /** Has a note or an answer that failed written again. */
  retryPenPalNote: (noteId: string) => Promise<PenPalNote>;
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
  /**
   * Reports a partner's line or a correction of a conversation (spec §16.1). Rejects with an
   * `ApiError` (`flag_limit`, `network`, …).
   */
  flagItem: (conversationId: string, input: FlagInput) => Promise<Flag>;
  /** What the learner reported in a conversation. */
  readFlags: (conversationId: string) => Promise<{ flags: Flag[] }>;
  /** The owner's review queue. Rejects with an `ApiError` (`not_owner`, …). */
  readFlagQueue: (status: FlagStatus) => Promise<{ flags: QueuedFlag[] }>;
  /** Closes a flag as resolved or dismissed, or opens it again (the owner). */
  resolveFlag: (id: string, status: FlagStatus) => Promise<QueuedFlag>;
  /**
   * Sends the owner a message (spec §6.21.4). Rejects with an `ApiError` (`feedback_limit`,
   * `network`, …).
   */
  sendFeedback: (input: FeedbackInput) => Promise<unknown>;
  /** The owner's inbox of messages. Rejects with an `ApiError` (`not_owner`, …). */
  readFeedbackInbox: (status: FeedbackStatus) => Promise<{ messages: InboxFeedback[] }>;
  /** Marks a message done, or opens it again (the owner). */
  resolveFeedback: (id: string, status: FeedbackStatus) => Promise<InboxFeedback>;
  /** Where a card's sound plays from (made the first time). Rejects with an `ApiError`. */
  cardSound: (id: string) => Promise<string>;
  /** One of the learner's cards. Rejects with an `ApiError` (`not_found`, …). */
  readCard: (id: string) => Promise<Card>;
  exportCards: () => Promise<{ text: string }>;
  /** Whether the server may reach this phone by push. Reject with an `ApiError`. */
  push: {
    register: (device: PushDevice) => Promise<unknown>;
    remove: (token: string) => Promise<unknown>;
  };
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
    | 'draftImportReply'
    | 'getProgress'
    | 'getRecordingTiming'
    | 'getConversations'
    | 'getConversation'
    | 'getThenVsNow'
    | 'getConversationReport'
    | 'requestConversationReport'
    | 'saveCard'
    | 'getCards'
    | 'exportCards'
    | 'getDueCards'
    | 'reviewCard'
    | 'removeCard'
    | 'getTutorQuestions'
    | 'getPenPal'
    | 'updatePenPalSettings'
    | 'getPenPalThread'
    | 'openPenPalThread'
    | 'askForPenPalNote'
    | 'sendPenPalReply'
    | 'retryPenPalNote'
    | 'getCatalog'
    | 'askTutor'
    | 'getPhrasebook'
    | 'savePhrase'
    | 'lookupCaption'
    | 'saveCaptionWord'
    | 'suggestPhrases'
    | 'makePhraseCard'
    | 'getPhraseAudio'
    | 'removePhrase'
    | 'getImports'
    | 'startImportUpload'
    | 'createImport'
    | 'getImport'
    | 'removeImport'
    | 'makeImportWordCard'
    | 'explainCorrection'
    | 'getGrammarMap'
    | 'getGrammarTopic'
    | 'retryCorrection'
    | 'getRetries'
    | 'sendFeedback'
    | 'getFeedbackInbox'
    | 'resolveFeedback'
    | 'flagItem'
    | 'getFlags'
    | 'getFlagQueue'
    | 'resolveFlag'
    | 'getCardAudio'
    | 'getPronunciationSounds'
    | 'getPronunciationSound'
    | 'getProblemWords'
    | 'getPronunciationAudio'
    | 'drillPronunciation'
    | 'assessConversationPronunciation'
    | 'pickPronunciationWord'
    | 'getCard'
    | 'registerPushDevice'
    | 'removePushDevice'
    | 'answerCard'
    | 'requestWeekReview'
    | 'getWeekReview'
    | 'getWeekReviewAudio'
    | 'getExamCentre'
    | 'getNextSimulation'
    | 'getSimulation'
    | 'rescoreSimulation'
    | 'getModelAnswerAudio'
  >,
  clock: DeviceClock,
  clips: ClipPlayer,
  photos: ImportPhotos,
  extensions: Pick<PracticeServices, 'libraryTools' | 'offline'> & {
    documents?: ImportDocuments;
  } = {},
): PracticeServices {
  const home = createHomeStore(api, clock);
  const deck = createDeckStore(api);
  const tutor = createResourceStore(() => api.getTutorQuestions(), clock.now);
  const catalog = createResourceStore(() => api.getCatalog(), clock.now);
  const phrasebook = createResourceStore(() => api.getPhrasebook(), clock.now);
  const pronunciation = createResourceStore(async () => {
    const [{ sounds, assessmentProvider }, { words }] = await Promise.all([
      api.getPronunciationSounds(),
      api.getProblemWords(),
    ]);
    return { sounds, words, assessmentProvider: assessmentProvider ?? null };
  }, clock.now);

  const imports = createResourceStore(() => api.getImports(), clock.now);

  const penPal = createResourceStore(() => api.getPenPal(), clock.now);
  return {
    ...extensions,
    home,
    progress: createResourceStore(() => api.getProgress(clock.timeZone()), clock.now),
    followWeekReview: (week) => createWeekReviewFollower(api, week, clock.timeZone()),
    weekSound: async (week) => (await api.getWeekReviewAudio(week)).url,
    exams: createResourceStore(() => api.getExamCentre(), clock.now),
    readNextSimulation: (exam) => api.getNextSimulation(exam),
    followSimulation: (callId) => createSimulationFollower(api, callId),
    modelAnswerSound: async (callId, part) => (await api.getModelAnswerAudio(callId, part)).url,
    library: createLibraryStore(api),
    readConversation: (id) => api.getConversation(id),
    readRecordingTiming: (id, index) => api.getRecordingTiming(id, index),
    readThenVsNow: () => api.getThenVsNow(),
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
    phrasebook,
    lookupCaption: (language, word, caption) => api.lookupCaption(language, word, caption),
    async saveCaptionWord(language, word, meaning) {
      const card = await api.saveCaptionWord(language, word, meaning);
      void deck.refresh();
      void home.refresh();
      return card;
    },
    async suggestPhrases(situation) {
      return (await api.suggestPhrases(situation)).suggestions;
    },
    keepPhrase: (draft) =>
      phrasebook.mutate(
        () => api.savePhrase(draft),
        (shown, kept) => ({
          phrases: [kept, ...shown.phrases.filter((phrase) => phrase.id !== kept.id)],
        }),
      ),
    async makePhraseCard(id) {
      const card = await api.makePhraseCard(id);
      void phrasebook.refresh();
      void deck.refresh();
      void home.refresh();
      return card;
    },
    async removePhrase(id) {
      await phrasebook.mutate(
        () => api.removePhrase(id),
        (_, answer) => answer,
      );
    },
    pronunciation,
    readPronunciationSound: (id) => api.getPronunciationSound(id),
    pronunciationSound: async (text) => (await api.getPronunciationAudio(text)).url,
    async assessConversationPronunciation(callId, turn, recording) {
      const result = await api.assessConversationPronunciation(callId, turn, {
        recording: spoken(recording),
        assessmentConsent: true,
      });
      void pronunciation.refresh();
      return result;
    },
    async drillPronunciation(drill, recording) {
      const attempt = await api.drillPronunciation({ ...drill, recording: spoken(recording) });
      void pronunciation.refresh();
      return attempt;
    },
    async pickPronunciationWord(soundId, played, chosen) {
      const { right } = await api.pickPronunciationWord({ soundId, played, chosen });
      void pronunciation.refresh();
      return right;
    },

    imports,
    readImport: (id) => api.getImport(id),
    async bringImport(draft) {
      const made = await api.createImport(draft);
      void imports.refresh();
      return made;
    },
    async bringDocument(kind, book) {
      if (!extensions.documents) throw new ApiError('unavailable');
      const document = await extensions.documents.pick(kind);
      if (!document) return null;
      try {
        const upload = await api.startImportUpload(kind);
        await extensions.documents.send(upload, document);
        const made = await api.createImport({ kind, uploadId: upload.uploadId, ...book });
        void imports.refresh();
        return made;
      } finally {
        await extensions.documents.release?.(document);
      }
    },
    async bringPhoto(book, source = 'library') {
      const picked = await photos.pick(source);
      if (picked.status === 'cancelled') return null;
      if (picked.status === 'failed') throw new ApiError('invalid_photo');
      const upload = await api.startImportUpload();
      await photos.send(upload, picked.picture);
      const made = await api.createImport({ kind: 'photo', uploadId: upload.uploadId, ...book });
      void imports.refresh();
      return made;
    },
    async removeImport(id) {
      await imports.mutate(
        () => api.removeImport(id),
        (_, answer) => answer,
      );
    },
    async makeImportCard(id, index) {
      const card = await api.makeImportWordCard(id, index);
      void deck.refresh();
      void home.refresh();
      return card;
    },
    tutor,
    penPal,
    readPenPalThread: (personaId) => api.getPenPalThread(personaId),
    changePenPal: (changes) =>
      penPal.mutate(
        () => api.updatePenPalSettings(changes),
        (shown, settings) => ({ ...shown, settings }),
      ),
    async openPenPalThread(personaId) {
      await penPal.mutate(
        () => api.openPenPalThread(personaId),
        (_, overview) => overview,
      );
    },
    askForPenPalNote: (personaId) => api.askForPenPalNote(personaId),
    sendPenPalReply: (personaId, recording) => api.sendPenPalReply(personaId, spoken(recording)),
    retryPenPalNote: (noteId) => api.retryPenPalNote(noteId),
    grammar: createResourceStore(() => api.getGrammarMap(), clock.now),
    readGrammarTopic: (id) => api.getGrammarTopic(id),
    cardSound: async (id) => (await api.getCardAudio(id)).url,
    phraseSound: async (id) => (await api.getPhraseAudio(id)).url,
    draftImportReply: async (id) => (await api.draftImportReply(id)).reply,
    readCard: (id) => api.getCard(id),
    exportCards: () => api.exportCards(),
    push: {
      register: (device) => api.registerPushDevice(device),
      remove: (token) => api.removePushDevice(token),
    },
    retryCorrection: (conversationId, index, recording) =>
      api.retryCorrection(conversationId, index, spoken(recording)),
    answerCard: (id, recording) => api.answerCard(id, spoken(recording)),
    readRetries: (conversationId) => api.getRetries(conversationId),
    sendFeedback: (input) => api.sendFeedback(input),
    readFeedbackInbox: (status) => api.getFeedbackInbox(status),
    resolveFeedback: (id, status) => api.resolveFeedback(id, status),
    flagItem: (conversationId, input) => api.flagItem(conversationId, input),
    readFlags: (conversationId) => api.getFlags(conversationId),
    readFlagQueue: (status) => api.getFlagQueue(status),
    resolveFlag: (id, status) => api.resolveFlag(id, status),
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
    services.exams.reset();
    services.tutor.reset();
    services.phrasebook.reset();
    services.pronunciation.reset();

    services.imports.reset();

    services.penPal.reset();
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
/** The exam centre; re-renders when it changes. */
export function useExamCentre(): ResourceState<ExamCentre> {
  const { exams } = usePracticeServices();
  return useSyncExternalStore(exams.subscribe, exams.getState, exams.getState);
}

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

export type ThenVsNowReading =
  | { phase: 'loading' }
  | { phase: 'failed'; code: string }
  // Only a ready pair has its two transcripts; the other states say why there is none.
  | { phase: 'ready'; pair: Exclude<ThenVsNow['status'], 'ready'> }
  | { phase: 'ready'; pair: 'ready'; weeksApart: number; then: Transcript; now: Transcript };

/** Reads the pair to compare (5.20) and, when there is one, both conversations. */
export function useThenVsNow(): ThenVsNowReading & { retry: () => void } {
  const { readThenVsNow, readConversation } = usePracticeServices();
  const [reading, setReading] = useState<ThenVsNowReading>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    (async () => {
      const found = await readThenVsNow();
      if (found.status !== 'ready' || !found.then || !found.now) {
        return { phase: 'ready', pair: found.status === 'ready' ? 'none' : found.status } as const;
      }
      const [then, now] = await Promise.all([
        readConversation(found.then.id),
        readConversation(found.now.id),
      ]);
      return { phase: 'ready', pair: 'ready', weeksApart: found.weeksApart, then, now } as const;
    })().then(
      (next) => current && setReading(next),
      (error: unknown) => current && setReading({ phase: 'failed', code: apiErrorCode(error) }),
    );
    return () => {
      current = false;
    };
  }, [readThenVsNow, readConversation, attempt]);

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

/** The learner's phrasebook; re-renders when it changes. */
export function usePhrasebook(): ResourceState<{ phrases: Phrase[] }> {
  const { phrasebook } = usePracticeServices();
  return useSyncExternalStore(phrasebook.subscribe, phrasebook.getState, phrasebook.getState);
}

/** The pronunciation lab; re-renders when it changes. */
export function usePronunciation(): ResourceState<PronunciationLab> {
  const { pronunciation } = usePracticeServices();
  return useSyncExternalStore(
    pronunciation.subscribe,
    pronunciation.getState,
    pronunciation.getState,
  );
}

/** What the learner brought; re-renders when it changes. */
export function useImports(): ResourceState<CourseImports> {
  const { imports } = usePracticeServices();
  return useSyncExternalStore(imports.subscribe, imports.getState, imports.getState);
}

/**
 * The pen-pal settings and a line per partner; re-renders when they change. Reads them when
 * first asked and again when the app comes back after a while, so a new note shows.
 */
export function usePenPal(): ResourceState<PenPal> {
  const { penPal } = usePracticeServices();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  useEffect(() => {
    if (signedIn) void penPal.load();
  }, [signedIn, penPal]);
  return useSyncExternalStore(penPal.subscribe, penPal.getState, penPal.getState);
}

/** The questions asked to the Tutor; re-renders when they change. */
export function useTutor(): ResourceState<{ questions: TutorQuestion[] }> {
  const { tutor } = usePracticeServices();
  return useSyncExternalStore(tutor.subscribe, tutor.getState, tutor.getState);
}

/** What the app offers (languages, exams, role-plays), read when first asked; re-renders on change. */
export function useCatalog(): ResourceState<Catalog> {
  const { catalog } = usePracticeServices();
  useEffect(() => {
    void catalog.load();
  }, [catalog]);
  return useSyncExternalStore(catalog.subscribe, catalog.getState, catalog.getState);
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
