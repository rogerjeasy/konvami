import {
  ApiError,
  type Activity,
  type ApiClient,
  type Card,
  type Catalog,
  type Conversation,
  type Costs,
  type GrammarMap,
  type GrammarTopic,
  type GrammarTopicPage,
  type ConversationReport,
  type Home,
  type HomePartner,
  type Memories,
  type Memory,
  type Onboarding,
  type Persona,
  type PersonaDraft,
  type Placement,
  type PlacementResult,
  type PlacementStatus,
  type Profile,
  type ProfileChange,
  type ProfileSource,
  type LevelPoint,
  type Progress,
  type Rating,
  type SessionReport,
  type TranscriptTurn,
  type TurnAudio,
  type TutorAnswer,
  type TutorQuestion,
  type ExamCard,
  type ExamCentre,
  type Simulation,
  type SpeakingExam,
  type ReminderNotes,
  type WeekPlan,
  type WeekReview,
  type WordDetails,
} from '@konvami/api-client';
import { draftOf, ROLE_TEACHING } from '@/profile/persona-draft';

/**
 * An in-memory `ApiClient` for tests. It keeps a profile the way the server does (one value per
 * field, per language) and works out the onboarding stage with the server's rule, so screens see
 * the same answers they would get from the real API. `failNext` makes the next call to one
 * method fail with a given code.
 */
export const FAKE_CATALOG: Catalog = {
  languages: [
    {
      code: 'de',
      available: true,
      exams: [
        { id: 'goethe', name: 'Goethe-Zertifikat', levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
        { id: 'telc', name: 'telc Deutsch', levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
        { id: 'dtz', name: 'Deutsch-Test für Zuwanderer', levels: ['A2', 'B1'] },
        { id: 'testdaf', name: 'TestDaF', levels: ['B2', 'C1'] },
        { id: 'osd', name: 'ÖSD', levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
      ],
      // As the German pack has them (services/api: domain/scenarios.py).
      scenarios: [
        { id: 'bakery', level: 'A1', goals: ['order', 'price', 'pay'] },
        { id: 'doctor', level: 'A2', goals: ['symptoms', 'since_when', 'advice'] },
        { id: 'pharmacy', level: 'A2', goals: ['need', 'dose', 'pay'] },
        { id: 'train_ticket', level: 'A2', goals: ['destination', 'ticket', 'platform'] },
        { id: 'registration', level: 'B1', goals: ['purpose', 'documents', 'next_step'] },
        { id: 'flat_viewing', level: 'B1', goals: ['rent', 'about_me', 'move_in'] },
        { id: 'job_interview', level: 'B1', goals: ['introduce', 'strength', 'question'] },
        { id: 'complaint', level: 'B1', goals: ['problem', 'solution', 'agree'] },
      ],
    },
    { code: 'en', available: false, exams: [], scenarios: [] },
    { code: 'fr', available: false, exams: [], scenarios: [] },
    { code: 'it', available: false, exams: [], scenarios: [] },
  ],
  explanationLanguages: [
    { code: 'en', name: 'English' },
    { code: 'de', name: 'Deutsch' },
    { code: 'fr', name: 'Français' },
    { code: 'it', name: 'Italiano' },
    { code: 'es', name: 'Español' },
    { code: 'pt', name: 'Português' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'sq', name: 'Shqip' },
  ],
  startingLevels: ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  examLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  goalReasons: [
    'travel',
    'work',
    'study',
    'exam',
    'living_abroad',
    'family_friends',
    'culture',
    'other',
  ],
  explanationUsages: ['never', 'when_stuck', 'for_grammar', 'freely'],
};

/** The server's essential questions, in asking order (services/api: domain/onboarding.py). */
const ESSENTIAL_FIELDS = [
  'explanation_language',
  'explanation_usage',
  'goals',
  'exam',
  'self_assessed_level',
  'course',
];

/** The fake server's clock: a Friday, at noon in UTC. Its week runs from Monday 5 October. */
export const FAKE_NOW = '2026-10-09T12:00:00Z';
/** When the week of `FAKE_NOW` ends and voice minutes come back: Monday, in UTC. */
export const FAKE_WEEK_ENDS = '2026-10-12T00:00:00Z';
/** Each learner's voice minutes per week, in seconds (as configured on the server). */
export const FAKE_WEEKLY_SECONDS = 3600;
/** As on the server (services/api: domain/voice.py MIN_CALL_SECONDS). */
const MIN_CALL_SECONDS = 60;

/**
 * This week's plan as the server's Learning Director would make it for a new learner of A2: one
 * ten-minute conversation today, practising the first of the week's topics.
 */
export const FAKE_PLAN: WeekPlan = {
  week: '2026-10-05',
  minutes: 40,
  days: 4,
  capped: false,
  sessions: { exam: 0, review: 0, rolePlay: 1, free: 3 },
  topics: ['perfekt', 'dative', 'two_way_prepositions'],
  cards: 0,
  doneMinutes: 0,
  doneDays: 0,
  today: [{ kind: 'free', minutes: 10, topic: 'perfekt', scenario: null, exam: null }],
  todayCards: 0,
  reason: 'on_track',
  missed: [],
  exam: null,
  upcoming: ['2026-10-10', '2026-10-12', '2026-10-13', '2026-10-15'],
};

/** A saved word, as a word of the day brings it. */
export const FAKE_WORD_CARD: Card = {
  id: 'card_word',
  kind: 'word',
  front: 'die Abschiedsfeier',
  back: 'the farewell party',
  note: 'Wir planen eine Abschiedsfeier für Maria.',
  explainedIn: 'en',
  conversationId: null,
  createdAt: '2026-10-02T12:00:00Z',
  dueAt: '2026-10-12T12:00:00Z',
  reviewedAt: null,
  reviews: 0,
  lapses: 0,
  details: null,
};

/** The week's simulations for a learner five weeks from the Goethe B1: one, not done yet. */
export const FAKE_EXAM_WEEK: NonNullable<WeekPlan['exam']> = {
  test: 'goethe_b1',
  name: 'Goethe-Zertifikat B1',
  pace: 'weekly',
  minutes: 10,
  wanted: 1,
  simulations: 1,
  done: 0,
  weakest: null,
};

/** Last week's check-in as Progress gets it before anyone asked for its words. */
export const FAKE_WEEK_REVIEW: WeekReview = {
  status: 'none',
  text: null,
  numbers: {
    week: '2026-09-28',
    minutes: 34,
    plannedMinutes: 40,
    previousMinutes: 25,
    days: 3,
    plannedDays: 4,
    conversations: 4,
    rolePlays: 1,
    reviews: 1,
    cardsReviewed: 12,
    topics: [
      { topic: 'dative', before: 'practising', after: 'mostly_correct', moved: true },
      { topic: 'perfekt', before: 'mostly_correct', after: 'mostly_correct', moved: false },
    ],
    mistakes: 3,
    previousMistakes: 5,
    levelBefore: 'A2',
    levelAfter: 'A2',
    wordsPlanned: 5,
    wordsUsed: 3,
  },
};

/** What the partner's worker writes for `FAKE_WEEK_REVIEW`. */
export const FAKE_WEEK_TEXT =
  'You spoke for 34 minutes last week, nine more than the week before. The dative is coming along nicely. Does this week’s plan suit you? You can change your weekly goal in your profile.';

/** Two of the server's speaking tests (services/api: domain/exams.py), as the centre lists them. */
export const FAKE_SPEAKING_EXAMS: SpeakingExam[] = [
  {
    id: 'goethe_b1',
    exam: 'goethe',
    levels: ['B1'],
    name: 'Goethe-Zertifikat B1',
    prepSeconds: 900,
    passShare: 0.6,
    parts: [
      { id: 'teil_1', kind: 'plan_together', seconds: 180 },
      { id: 'teil_2', kind: 'present_topic', seconds: 180 },
      { id: 'teil_3', kind: 'feedback_questions', seconds: 120 },
    ],
  },
  {
    id: 'dtz',
    exam: 'dtz',
    levels: ['A2', 'B1'],
    name: 'Deutsch-Test für Zuwanderer',
    prepSeconds: 0,
    passShare: 0.6,
    parts: [
      { id: 'teil_1', kind: 'introduce', seconds: 120 },
      { id: 'teil_2', kind: 'picture_experience', seconds: 180 },
      { id: 'teil_3', kind: 'plan_together', seconds: 180 },
    ],
  },
];

/** The cards of the next Goethe B1 simulation. */
export const FAKE_EXAM_CARDS: ExamCard[] = [
  {
    id: 'b1_1a',
    title: 'Eine Kollegin hört auf zu arbeiten. Planen Sie eine Abschiedsfeier.',
    prompts: ['Wann?', 'Wo?', 'Essen und Getränke?', 'Geschenk?'],
  },
  {
    id: 'b1_2a',
    title: 'Sollen Kinder ein eigenes Handy haben?',
    prompts: [
      'Thema vorstellen',
      'Eigene Erfahrung',
      'Situation in Ihrem Heimatland',
      'Vor- und Nachteile, Ihre Meinung',
      'Abschluss und Dank',
    ],
  },
  {
    id: 'b1_3',
    title: 'Über die Präsentation sprechen',
    prompts: ['Auf die Rückmeldung reagieren', 'Fragen beantworten'],
  },
];

/** What the scorer writes for a Goethe B1 simulation: 62.5 %, just past the pass mark. */
export const FAKE_SIMULATION_RESULT: NonNullable<Simulation['result']> = {
  total: 0.625,
  passed: true,
  passShare: 0.6,
  summary: 'Work on the verb’s place after “weil” and on a longer presentation.',
  parts: ['teil_1', 'teil_2', 'teil_3'].map((part) => ({
    part,
    marks: { task: 3, coherence: 3, vocabulary: 2, grammar: 2 },
    share: 0.625,
    feedback: 'You suggested a date and a place and reacted to the objection.',
    modelAnswer: 'Ich schlage vor, dass wir am Freitag nach der Arbeit feiern.',
  })),
};

/** A month of spending as the owner sees it: past the target, two learners, a few features. */
export const FAKE_COSTS: Costs = {
  month: '2026-10-01',
  level: 'economy',
  targetUsd: 150,
  ceilingUsd: 250,
  totalUsd: 162.4,
  unpriced: 0,
  days: [
    { day: '2026-10-07', usd: 41.2 },
    { day: '2026-10-08', usd: 88.5 },
    { day: '2026-10-09', usd: 32.7 },
  ],
  features: [
    { key: 'voice_practice', usd: 120.1, requests: 180 },
    { key: 'report', usd: 22.3, requests: 170 },
    { key: 'report_check', usd: 9.8, requests: 160 },
    { key: 'tutor', usd: 6.2, requests: 75 },
    { key: 'memory', usd: 4, requests: 170 },
  ],
  providers: [{ key: 'openai', usd: 162.4, requests: 755 }],
  learners: [
    {
      userId: '11111111-1111-4111-8111-111111111111',
      name: 'Amara',
      usd: 98.6,
      requests: 410,
      voiceSeconds: 21_600,
    },
    {
      userId: '22222222-2222-4222-8222-222222222222',
      name: null,
      usd: 63.8,
      requests: 345,
      voiceSeconds: 14_400,
    },
  ],
};
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
/** As on the server (services/api: domain/conversations.py and domain/home.py). */
const PAGE_DEFAULT = 20;
const RECENT_CONVERSATIONS = 3;

/**
 * When a card comes back after each rating, as the fake server has it (ms). The real server
 * works it out per card (services/api: domain/fsrs.py); these are its answers for a new card.
 */
export const FAKE_DUE_IN_MS: Record<Rating, number> = {
  again: 10 * MINUTE_MS,
  hard: DAY_MS,
  good: 2 * DAY_MS,
  easy: 8 * DAY_MS,
};
/** As on the server (services/api: domain/cards.py). */
const CARDS_PAGE_DEFAULT = 50;
const QUEUE_DEFAULT = 20;

/** A placement result one level above the typical learner's own estimate (A2). */
export const FAKE_RESULT: PlacementResult = {
  levels: { speaking: 'B1', listening: 'B1', grammar: 'A2', vocabulary: 'B1', pronunciation: 'B2' },
  overall: 'B1',
  weakAreas: ['Word order after “weil”: “weil sie ist ruhig”', 'Dative after “mit”'],
  measuredAt: FAKE_NOW,
};

/**
 * The report on a conversation in which the learner said `FAKE_REPORT_SAYS`: two mistakes (the
 * second one not confirmed by the second check), a more natural wording, two words, a win and
 * two next steps. Explained in English.
 */
/** What the fake Tutor answers to every question. */
export const FAKE_TUTOR_ANSWER: TutorAnswer = {
  explanation: 'After “mit”, German always uses the dative: der Bus becomes dem Bus.',
  examples: [
    { text: 'Ich fahre mit dem Bus.', translation: 'I take the bus.' },
    { text: 'Ich spreche mit der Lehrerin.', translation: 'I talk to the teacher.' },
  ],
  topic: 'case_dative',
  unsure: false,
};

export const FAKE_REPORT_SAYS = [
  'Gut. Ich habe nach Berlin gefahren mit der Bus.',
  'Ich habe ein Museum besucht, weil es war sehr interessant.',
];
export const FAKE_REPORT: SessionReport = {
  language: 'en',
  summary: 'You told Lena about your weekend in Berlin and the museum you visited.',
  mistakes: [
    {
      turn: 1,
      original: 'Ich habe nach Berlin gefahren',
      corrected: 'Ich bin nach Berlin gefahren',
      explanation: 'Verbs of movement such as “fahren” form the Perfekt with “sein”.',
      category: 'perfekt_auxiliary',
      severity: 'noticeable',
      certain: true,
      saved: false,
    },
    {
      turn: 2,
      original: 'weil es war sehr interessant',
      corrected: 'weil es sehr interessant war',
      explanation: 'After “weil” the verb goes to the end.',
      category: 'word_order_subordinate',
      severity: 'minor',
      certain: false,
      saved: false,
    },
  ],
  rewrites: [
    {
      turn: 2,
      original: 'Ich habe ein Museum besucht',
      natural: 'Ich war im Museum',
      note: 'Shorter, and what people usually say.',
    },
  ],
  words: [
    {
      text: 'das Wochenende',
      meaning: 'weekend',
      example: 'Wie war dein Wochenende?',
      saved: false,
    },
    { text: 'die Ausstellung', meaning: 'exhibition', example: null, saved: false },
  ],
  wins: ['You told a whole story in the past tense.'],
  nextSteps: ['The Perfekt with “sein” for verbs of movement', 'Verb at the end after “weil”'],
  stats: { learnerWords: 19, partnerWords: 14, learnerTurns: 2, longestTurnWords: 10 },
  levelStep: null,
};

const BALANCED: Persona['personality'] = {
  warmth: 3,
  playfulness: 3,
  talkativeness: 3,
  curiosity: 3,
  humour: 3,
  formOfAddress: 'auto',
  style: 'questions',
};

/** The partners the server proposes, as the German pack's built-in ones (no tagline). */
export const FAKE_PERSONAS: Persona[] = [
  {
    id: '7b1c2f0e-6c1b-4a8e-9a55-0d2f6a1c9e11',
    role: 'buddy',
    name: 'Lena',
    gender: 'female',
    age: 27,
    origin: 'Berlin',
    occupation: '',
    tagline: null,
    backstory: 'Lena arbeitet als Grafikerin in Berlin und hat eine Katze namens Krümel.',
    look: {
      skin: 'sand',
      hair: 'bob',
      hairColor: 'chestnut',
      top: 'teal',
      backdrop: 'mist',
      glasses: false,
      beard: false,
    },
    voice: 'marin',
    personality: BALANCED,
    teaching: ROLE_TEACHING.buddy,
  },
  {
    id: '1d0f8a52-3c7e-4f0b-8a41-5b9e2c7d4a22',
    role: 'teacher',
    name: 'Jonas',
    gender: 'male',
    age: 34,
    origin: 'Zürich',
    occupation: 'Deutschlehrer',
    tagline: 'Clear explanations and plenty of patience.',
    backstory: 'Jonas unterrichtet Deutsch in Zürich und segelt am Wochenende.',
    look: {
      skin: 'honey',
      hair: 'short',
      hairColor: 'espresso',
      top: 'graphite',
      backdrop: 'sand',
      glasses: true,
      beard: true,
    },
    voice: 'cedar',
    personality: BALANCED,
    teaching: ROLE_TEACHING.teacher,
  },
  {
    id: 'c4e9b7a1-2f6d-4d3c-9b18-6a0f1e8d5c33',
    role: 'exam_coach',
    name: 'Frau Weber',
    gender: 'female',
    age: 52,
    origin: 'Wien',
    occupation: 'Prüferin',
    tagline: null,
    backstory: 'Frau Weber ist Prüferin für Sprachzertifikate in Wien.',
    look: {
      skin: 'porcelain',
      hair: 'bun',
      hairColor: 'silver',
      top: 'stone',
      backdrop: 'slate',
      glasses: true,
      beard: false,
    },
    voice: 'sage',
    personality: BALANCED,
    teaching: ROLE_TEACHING.exam_coach,
  },
];

/** What the server writes from any description: a teacher from Hamburg with her own settings. */
export const FAKE_DRAFT: PersonaDraft = {
  role: 'teacher',
  name: 'Greta',
  gender: 'female',
  age: 30,
  origin: 'Hamburg',
  occupation: 'Marketing-Managerin',
  tagline: 'Friendly and precise, loves sailing.',
  backstory: 'Greta arbeitet im Marketing in Hamburg und segelt jedes Wochenende.',
  look: {
    skin: 'honey',
    hair: 'bob',
    hairColor: 'auburn',
    top: 'amber',
    backdrop: 'sand',
    glasses: true,
    beard: false,
  },
  voice: 'coral',
  personality: {
    warmth: 5,
    playfulness: 2,
    talkativeness: 4,
    curiosity: 3,
    humour: 1,
    formOfAddress: 'formal',
    style: 'stories',
  },
  teaching: {
    correctionTiming: 'immediate',
    strictness: 'everything',
    explanationUsage: null,
    level: null,
    focus: 'Dativ und Perfekt',
    speed: 0.9,
  },
};

/** The language pack's ready-made partners: the three starter ones and a debate partner. */
export const FAKE_TEMPLATES: PersonaDraft[] = [
  ...FAKE_PERSONAS.map(draftOf),
  {
    ...draftOf(FAKE_PERSONAS[0]!),
    name: 'Mara',
    age: 34,
    occupation: 'Journalistin',
    backstory: 'Mara ist Journalistin in Berlin und diskutiert leidenschaftlich gern.',
    voice: 'coral',
    personality: { ...BALANCED, curiosity: 5, formOfAddress: 'informal', style: 'debate' },
  },
];

/** As on the server (services/api: domain/memories.py and domain/profile.py). */
const MEMORY_TEXT_MAX = 200;
const MAX_AVOID_TOPICS = 10;

/**
 * What Amara's partners know about her after a few conversations, newest first: something
 * coming up, something about her life, something she would rather not talk about, and
 * something that is between her and Lena.
 */
export const FAKE_MEMORIES: Memory[] = [
  {
    id: 'eeeeeeee-eeee-4eee-8eee-000000000004',
    kind: 'relationship',
    text: 'Promised Lena a photo of her sister’s visit.',
    day: null,
    partnerId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    partnerName: 'Lena',
    createdAt: '2026-10-08T18:00:00Z',
    updatedAt: '2026-10-08T18:00:00Z',
  },
  {
    id: 'eeeeeeee-eeee-4eee-8eee-000000000003',
    kind: 'preference',
    text: 'Would rather not talk about politics.',
    day: null,
    partnerId: null,
    partnerName: null,
    createdAt: '2026-10-08T18:00:00Z',
    updatedAt: '2026-10-08T18:00:00Z',
  },
  {
    id: 'eeeeeeee-eeee-4eee-8eee-000000000002',
    kind: 'fact',
    text: 'Works as a nurse and wants to change jobs.',
    day: null,
    partnerId: null,
    partnerName: null,
    createdAt: '2026-10-06T18:00:00Z',
    updatedAt: '2026-10-06T18:00:00Z',
  },
  {
    id: 'eeeeeeee-eeee-4eee-8eee-000000000001',
    kind: 'event',
    text: 'Has a job interview at a logistics company in Zurich.',
    day: '2026-10-16',
    partnerId: null,
    partnerName: null,
    createdAt: '2026-10-06T18:00:00Z',
    updatedAt: '2026-10-06T18:00:00Z',
  },
];

/** What makes two memories the same, roughly as on the server: their words. */
const wording = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');

/** As on the server (services/api: domain/personas.py). */
const MAX_PARTNERS = 12;
const DRAFTS_PER_DAY = 20;
const FILES = 'https://files.test';

/** The forms the fake knows of the words of `FAKE_REPORT`, as the worker writes them. */
export const FAKE_WORD_FORMS: Record<string, WordDetails> = {
  'das Wochenende': {
    part: 'noun',
    article: 'das',
    plural: 'die Wochenenden',
    present: null,
    preterite: null,
    perfect: null,
    separable: null,
    case: null,
    comparative: null,
    superlative: null,
  },
};

const topic = (
  id: string,
  level: string,
  mastery: GrammarTopic['mastery'],
  uses = 0,
  correct = 0,
  conversations = 0,
  trend: GrammarTopic['trend'] = null,
): GrammarTopic => ({
  id,
  level,
  mastery,
  uses,
  correct,
  conversations,
  trend,
  lastUsedAt: uses ? '2026-10-08T18:00:00Z' : null,
});

/** A learner at A2 with a few conversations behind them: some topics used, most still ahead. */
export const FAKE_GRAMMAR_MAP: GrammarMap = {
  language: 'de',
  level: 'A2',
  topics: [
    topic('present_tense', 'A1', 'mastered', 24, 23, 6, 'steady'),
    topic('verb_second', 'A1', 'mostly_correct', 14, 11, 5, 'improving'),
    topic('articles_gender', 'A1', 'practising', 9, 5, 4, 'steady'),
    topic('negation', 'A1', 'introduced', 2, 2, 1),
    topic('plural', 'A1', 'not_started'),
    topic('perfekt', 'A2', 'mostly_correct', 12, 9, 4, 'improving'),
    topic('dative', 'A2', 'practising', 10, 5, 4, 'slipping'),
    topic('subordinate_clauses', 'A2', 'not_started'),
    topic('adjective_endings', 'B1', 'not_started'),
    topic('passive', 'B1', 'not_started'),
    topic('konjunktiv_1', 'B2', 'not_started'),
  ],
};

/** The page of a topic of `FAKE_GRAMMAR_MAP`: the dative with two of the learner's mistakes. */
export function fakeGrammarTopic(id: string): GrammarTopicPage | null {
  const found = FAKE_GRAMMAR_MAP.topics.find((t) => t.id === id);
  if (!found) return null;
  const dative = id === 'dative';
  return {
    topic: found,
    examples: dative
      ? ['Ich fahre mit dem Bus.', 'Ich helfe meiner Nachbarin.']
      : ['Ich wohne in Zürich.'],
    typicalMistakes: dative ? ['Ich fahre mit der Bus.', 'Ich helfe meine Mutter.'] : [],
    mistakes: dative
      ? [
          {
            conversationId: 'rtc_2',
            at: '2026-10-08T18:00:00Z',
            original: 'bei meine Freundin',
            corrected: 'bei meiner Freundin',
            explanation: '« bei » est toujours suivi du datif.',
            certain: false,
          },
          {
            conversationId: 'rtc_1',
            at: '2026-10-06T18:00:00Z',
            original: 'mit der Bus',
            corrected: 'mit dem Bus',
            explanation: '« mit » est toujours suivi du datif : der Bus devient dem Bus.',
            certain: true,
          },
        ]
      : [],
  };
}

export interface FakeApi extends ApiClient {
  failNext(method: keyof ApiClient, code: string, field?: string): void;
  /** What the next attempt at saying a correction again is heard as (its corrected words, else). */
  hearsNextRetry(heard: string): void;
  /** What the next card answered out loud is heard as; by default, its answer. */
  hearsNextAnswer(heard: string | ApiError): void;
  /** Every call so far, as `[method, ...arguments]`, in order. */
  readonly calls: readonly unknown[][];
  /** Stores answers directly, as if they had been given earlier. */
  answer(changes: ProfileChange[]): void;
  /**
   * Blocks every following call, or only the calls to `method`, until `release()` is called
   * (to observe loading states).
   */
  hold(method?: keyof ApiClient): () => void;
  /**
   * Puts the placement test where the server would have brought it: `assess('measured')` is a
   * finished test with a result, `assess('inconclusive')` one that could not be measured.
   */
  assess(status: PlacementStatus, result?: PlacementResult): void;
  /** Brings a learner with all answers straight to a later stage. */
  advanceTo(stage: 'placement' | 'partners' | 'ready'): void;
  /**
   * A learner who has finished onboarding and is in the app, with Lena and Jonas as partners
   * (and Frau Weber with `exam`). `measured` adds a placement test's result.
   */
  enterApp(options?: { measured?: boolean; exam?: unknown }): void;
  /**
   * Records a practice conversation with the partner at `partner` (0 is Lena), as the server
   * would after a call: started `daysAgo` days and `hoursAgo` hours before `FAKE_NOW`, ended
   * `minutes` later. With `ended: false` it is a call still running or being saved. With
   * `recorded`, every turn has a recording (`recordingOf`), and `verbatim` is what the verbatim
   * pass wrote for each of the learner's lines.
   */
  talked(
    partner: number,
    options?: {
      id?: string;
      daysAgo?: number;
      hoursAgo?: number;
      minutes?: number;
      learnerSays?: string[];
      ended?: boolean;
      recorded?: boolean;
      verbatim?: (string | null)[];
      /** A role-play: its scenario id, and the goals reached in it. */
      scenario?: string | null;
      goalsReached?: string[];
    },
  ): Conversation;
  /**
   * Questions asked to the Tutor earlier, oldest first, as the server keeps them; `answer`
   * replaces parts of `FAKE_TUTOR_ANSWER`.
   */
  askedTutor(
    questions: { question: string; answer?: Partial<TutorAnswer>; minutesAgo?: number }[],
  ): void;
  /** What the Tutor answers next (by default `FAKE_TUTOR_ANSWER`). */
  nextTutorAnswer(answer: Partial<TutorAnswer>): void;
  /** Ends a call recorded with `ended: false`. */
  finish(id: string, options?: { minutes?: number; learnerSays?: string[] }): void;
  /**
   * Says where the report on a conversation stands, as the server's worker would leave it: a
   * status, or a report that is ready (`FAKE_REPORT` unless one is given). A conversation
   * nobody said anything about has none.
   */
  reported(
    id: string,
    state?: Exclude<ConversationReport['status'], 'ready'> | SessionReport,
  ): void;
  /**
   * A learner with flashcards: a conversation whose report is ready (`FAKE_REPORT`), and its two
   * words and its confirmed correction saved as cards, all due. Returns the cards, oldest first.
   */
  learning(): Promise<Card[]>;
  /**
   * What the learner's partners know about them, as the server's worker would have written it
   * down after their conversations (`FAKE_MEMORIES` unless others are given).
   */
  remembering(memories?: Memory[]): void;
  /** The level over time, as the server's log of the learner's level would give it. Until this
   * is called, the history is the level set during onboarding, if any. */
  leveled(points: LevelPoint[]): void;
  /** Whether `deleteAccount` was called (and went through). */
  readonly deleted: boolean;
  /** The upload ids handed out so far, in order. */
  readonly uploads: readonly string[];
  /** Gives the learner a photo, as if one had been uploaded earlier. */
  havePicture(): void;
  /** Uses `minutes` of the learner's voice minutes this week, as calls would have. */
  usedMinutes(minutes: number): void;
  /** Makes the signed-in account the owner's, who may see the costs. */
  beOwner(): void;
  /** Changes this week's plan from `FAKE_PLAN`, as the server would have re-planned it. */
  planned(plan: Partial<WeekPlan>): void;
  /** What Today brings for the phone's reminders besides the plan (follow-ups, words). */
  noted(notes: Partial<ReminderNotes>): void;
  /**
   * The learner practised last week: Progress gets its check-in (`FAKE_WEEK_REVIEW` with
   * `review`'s changes). Asked for, its words are written by the time it is next read, unless
   * `writes` says the worker fails or takes longer.
   */
  practisedLastWeek(review?: Partial<WeekReview>, writes?: 'ready' | 'pending' | 'failed'): void;
  /**
   * An exam simulation done earlier (`FAKE_SIMULATION_RESULT` when scored), or the one a call
   * has just made: its score is written by the time it is next read, unless `scores` says the
   * worker fails, finds too little or takes longer.
   */
  simulated(
    callId: string,
    options?: {
      status?: Simulation['status'];
      result?: Simulation['result'];
      daysAgo?: number;
      scores?: 'ready' | 'pending' | 'failed' | 'too_short';
    },
  ): void;
  /** What the owner sees for a month (`FAKE_COSTS` for October 2026 unless set). */
  spent(costs: Costs): void;
}

/** The recording of turn `index` of a conversation recorded with `talked(…, { recorded })`. */
export function recordingOf(id: string, index: number): TurnAudio {
  return { url: `https://files.test/${id}/${index}.wav`, milliseconds: 1500 + index * 100 };
}

export function createFakeApi(): FakeApi {
  const fields = new Map<string, unknown>();
  // Where a value came from, for the fields the learner did not give themselves.
  const sources = new Map<string, ProfileSource>();
  const failures = new Map<keyof ApiClient, ApiError>();
  const calls: unknown[][] = [];
  let essentialsConfirmed = false;
  let placement: PlacementStatus = 'not_started';
  let result: PlacementResult | null = null;
  let personas: Persona[] | null = null;
  let partnersConfirmed = false;
  let completed = false;
  /** Every practice call, with what was said in it. */
  const practice: { conversation: Conversation; turns: TranscriptTurn[] }[] = [];
  /** The learner's flashcards, in the order they were made. */
  let cards: Card[] = [];
  /** Every review of a card that still exists: how it was rated. */
  let reviewLog: { id: string; rating: Rating }[] = [];
  /** Where each conversation's report stands; a conversation not in here has none. */
  const reports = new Map<string, ConversationReport>();
  /** What partners know about the learner, newest first, and what the learner set. */
  let memories: Memory[] = [];
  let levelHistory: LevelPoint[] | null = null;
  let memoryEnabled = true;
  // Newest first, as the server lists them.
  let tutorQuestions: TutorQuestion[] = [];
  // "Say it better": what the next attempt is heard as, and each conversation's corrections
  // said again, with whether one attempt was right.
  let nextRetryHeard: string | null = null;
  let nextAnswerHeard: string | ApiError | null = null;
  const retried = new Map<string, Map<number, boolean>>();
  let tutorAnswer: TutorAnswer = FAKE_TUTOR_ANSWER;
  const keepQuestion = (question: string, source: TutorQuestion['source'], at: number) => {
    const kept: TutorQuestion = {
      id: `q_${tutorQuestions.length + 1}`,
      askedAt: new Date(at).toISOString(),
      question,
      answer: tutorAnswer,
      source,
    };
    tutorAnswer = FAKE_TUTOR_ANSWER;
    tutorQuestions = [kept, ...tutorQuestions];
    return kept;
  };
  let recordingsKept = true;
  let avoidTopics: string[] = [];
  let picture: string | null = null;
  let usedSeconds = 0;
  let owner = false;
  const plan: WeekPlan = FAKE_PLAN;
  let planChanges: Partial<WeekPlan> = {};
  let reminderNotes: ReminderNotes = { followUps: [], words: [] };
  let lastWeek: WeekReview | null = null;
  let weekWrites: 'ready' | 'pending' | 'failed' = 'ready';
  const simulations = new Map<string, Simulation>();
  const scoring = new Map<string, 'ready' | 'pending' | 'failed' | 'too_short'>();
  const months = new Map<string, Costs>([[FAKE_COSTS.month, FAKE_COSTS]]);
  const uploads: string[] = [];
  let deleted = false;
  let drafts = 0;
  let created = 0;
  let gate: Promise<void> = Promise.resolve();
  const methodGates = new Map<keyof ApiClient, Promise<void>>();

  async function record(method: keyof ApiClient, ...args: unknown[]) {
    calls.push([method, ...args]);
    await gate;
    await methodGates.get(method);
    const failure = failures.get(method);
    if (failure) {
      failures.delete(method);
      throw failure;
    }
  }

  const target = () => (fields.get('global/target_language') as string | undefined) ?? null;

  function apply(changes: ProfileChange[]) {
    for (const change of changes) {
      if (change.field === 'target_language') {
        fields.set('global/target_language', change.value);
      } else {
        const scope = change.scope ?? target();
        if (!scope) throw new ApiError('target_language_required', 422, change.field);
        fields.set(`${scope}/${change.field}`, change.value ?? null);
      }
    }
  }

  function profile(): Profile {
    const result: Profile = { targetLanguage: target(), global: {}, languages: {} };
    for (const [key, value] of fields) {
      const [scope = '', field = ''] = key.split('/');
      const stored = { value, source: sources.get(key) ?? 'asked', updatedAt: FAKE_NOW };
      if (scope === 'global') result.global[field] = stored;
      else (result.languages[scope] ??= {})[field] = stored;
    }
    return result;
  }

  function onboarding(): Onboarding {
    const language = target();
    const missing = language
      ? ESSENTIAL_FIELDS.filter((field) => !fields.has(`${language}/${field}`))
      : ['target_language', ...ESSENTIAL_FIELDS];
    const stage = missing.length
      ? 'essentials'
      : !essentialsConfirmed
        ? 'review'
        : placement !== 'decided' && placement !== 'skipped'
          ? 'placement'
          : !partnersConfirmed
            ? 'partners'
            : completed
              ? 'done'
              : 'ready';
    return { stage, missing, placement };
  }

  const ownLevel = () =>
    (fields.get(`${target()}/self_assessed_level`) as string | undefined) ?? null;

  function startAt(level: string | null, status: PlacementStatus, source: ProfileSource) {
    const key = `${target()}/starting_level`;
    fields.set(key, level);
    sources.set(key, source);
    placement = status;
  }

  function placementView(): Placement {
    return {
      status: placement,
      selfAssessed: ownLevel() as Placement['selfAssessed'],
      differs: result !== null && result.overall !== ownLevel(),
      result,
    };
  }

  function requireStage(stage: Onboarding['stage']) {
    if (onboarding().stage !== stage) throw new ApiError('wrong_stage', 409);
  }

  function persona(id: string): Persona {
    const found = personas?.find((candidate) => candidate.id === id);
    if (!found) throw new ApiError('not_found', 404);
    return found;
  }

  const now = Date.parse(FAKE_NOW);
  const dayOf = (iso: string) => iso.slice(0, 10);
  const isoDay = (ms: number) => dayOf(new Date(ms).toISOString());

  function turnsOf(
    learnerSays: string[],
    recordedAs?: string,
    verbatim: (string | null)[] = [],
  ): TranscriptTurn[] {
    const turns: TranscriptTurn[] = [
      { speaker: 'persona', text: 'Hallo! Wie geht’s dir heute?', verbatim: null, audio: null },
      ...learnerSays.map((text, i): TranscriptTurn => ({
        speaker: 'learner',
        text,
        verbatim: verbatim[i] ?? null,
        audio: null,
      })),
    ];
    return recordedAs
      ? turns.map((turn, i) => ({ ...turn, audio: recordingOf(recordedAs, i) }))
      : turns;
  }

  /** Newest first, as the server lists them. */
  const newestFirst = () =>
    [...practice].sort((a, b) => b.conversation.startedAt.localeCompare(a.conversation.startedAt));
  /** The conversations that count: ended, and the learner said something. */
  const counted = () =>
    newestFirst()
      .map((entry) => entry.conversation)
      .filter((conversation) => conversation.endedAt !== null && conversation.learnerTurns > 0);

  function activity(): Activity {
    const seconds = new Map<string, number>();
    for (const conversation of counted()) {
      const day = dayOf(conversation.startedAt);
      seconds.set(day, (seconds.get(day) ?? 0) + conversation.seconds);
    }
    const today = dayOf(FAKE_NOW);
    let streak = 0;
    for (
      let day = seconds.has(today) ? now : now - DAY_MS;
      seconds.has(isoDay(day));
      day -= DAY_MS
    ) {
      streak += 1;
    }
    // FAKE_NOW is a Friday: its Monday is four days earlier.
    const monday = now - 4 * DAY_MS;
    const week = Array.from({ length: 7 }, (_, i) => {
      const day = isoDay(monday + i * DAY_MS);
      return { day, seconds: seconds.get(day) ?? 0 };
    });
    return {
      today,
      streakDays: streak,
      practisedToday: seconds.has(today),
      todaySeconds: seconds.get(today) ?? 0,
      weekSeconds: week.reduce((sum, day) => sum + day.seconds, 0),
      week,
      conversations: counted().length,
      seconds: [...seconds.values()].reduce((sum, value) => sum + value, 0),
    };
  }

  /** What makes two cards the same, as on the server: their words. */
  const cardKey = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');
  const hasCard = (kind: Card['kind'], front: string) =>
    cards.some((card) => card.kind === kind && cardKey(card.front) === cardKey(front));
  const dueCards = () =>
    cards
      .filter((card) => Date.parse(card.dueAt) <= now)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.createdAt.localeCompare(b.createdAt));
  const deckSummary = () => ({ total: cards.length, due: dueCards().length });

  /** As on the server: the last report's next steps, and until then the placement test's. */
  function focus(): Pick<Home, 'focus' | 'focusSource'> {
    const latest = counted()
      .map((conversation) => reports.get(conversation.id)?.report)
      .find((report) => report);
    if (latest?.nextSteps.length) return { focus: latest.nextSteps, focusSource: 'report' };
    if (result?.weakAreas.length) return { focus: result.weakAreas, focusSource: 'placement' };
    return { focus: [], focusSource: null };
  }

  /** As on the server (services/api: domain/progress.py), for the fake's own clock and UTC. */
  function progress(): Progress {
    const { level } = home();
    const done = activity();
    const monday = now - 4 * DAY_MS;
    const weekOf = (iso: string) => {
      const day = Date.parse(dayOf(iso));
      return isoDay(
        monday + Math.floor((day - Date.parse(isoDay(monday))) / (7 * DAY_MS)) * 7 * DAY_MS,
      );
    };
    const weekStarts = (count: number) =>
      Array.from({ length: count }, (_, i) => isoDay(monday - (count - 1 - i) * 7 * DAY_MS));

    const days = [...new Set(counted().map((c) => Date.parse(dayOf(c.startedAt))))].sort();
    let longest = 0;
    for (let i = 0, run = 0; i < days.length; i += 1) {
      run = i > 0 && days[i]! - days[i - 1]! === DAY_MS ? run + 1 : 1;
      longest = Math.max(longest, run);
    }

    const ready = counted().flatMap((conversation) => {
      const report = reports.get(conversation.id)?.report;
      return report ? [{ conversation, report }] : [];
    });
    const recent = ready.filter(
      ({ conversation }) => Date.parse(conversation.startedAt) >= now - 30 * DAY_MS,
    );
    const learnerWords = recent.reduce((sum, { report }) => sum + report.stats.learnerWords, 0);
    const partnerWords = recent.reduce((sum, { report }) => sum + report.stats.partnerWords, 0);

    const mistakeWeeks = weekStarts(6);
    const kinds = new Map<string, number[]>();
    for (const { conversation, report } of ready) {
      const place = mistakeWeeks.indexOf(weekOf(conversation.startedAt));
      if (place < 0) continue;
      for (const mistake of report.mistakes.filter(({ certain }) => certain)) {
        const counts = kinds.get(mistake.category) ?? mistakeWeeks.map(() => 0);
        counts[place] = (counts[place] ?? 0) + 1;
        kinds.set(mistake.category, counts);
      }
    }
    const total = (counts: number[]) => counts.reduce((sum, count) => sum + count, 0);

    const longestSeconds = Math.max(0, ...counted().map((c) => c.seconds));
    const mostWords = Math.max(0, ...ready.map(({ report }) => report.stats.learnerWords));
    const mark = (id: string, value: number, target: number) => ({
      id,
      current: Math.min(value, target),
      target,
      reached: value >= target,
    });
    return {
      language: target() ?? '',
      level,
      levelHistory:
        levelHistory ?? (level ? [{ at: FAKE_NOW, level: level.level, source: level.source }] : []),
      activity: done,
      weeks: weekStarts(8).map((start) => {
        const inWeek = counted().filter((c) => weekOf(c.startedAt) === start);
        return {
          start,
          seconds: inWeek.reduce((sum, c) => sum + c.seconds, 0),
          conversations: inWeek.length,
        };
      }),
      longestStreakDays: longest,
      talk: learnerWords + partnerWords > 0 ? { learnerWords, partnerWords } : null,
      mistakes: {
        weeks: mistakeWeeks,
        kinds: [...kinds]
          .sort(([a, x], [b, y]) => total(y) - total(x) || a.localeCompare(b))
          .slice(0, 6)
          .map(([category, counts]) => ({ category, counts })),
      },
      cards: {
        total: cards.length,
        due: dueCards().length,
        learned: cards.filter((card) => card.reviews > 0).length,
        reviews: reviewLog.length,
        remembered: reviewLog.filter(({ rating }) => rating !== 'again').length,
      },
      milestones: [
        mark('first_conversation', done.conversations, 1),
        mark('five_conversations', done.conversations, 5),
        mark('long_conversation', Math.floor(longestSeconds / 60), 8),
        mark('hour_of_talking', Math.floor(done.seconds / 60), 60),
        mark('week_streak', longest, 7),
        mark('hundred_words', mostWords, 100),
        mark('first_card', cards.length, 1),
        mark('fifty_reviews', reviewLog.length, 50),
      ],
      lastWeek,
    };
  }

  function home(): Home {
    if (onboarding().stage !== 'done') throw new ApiError('wrong_stage', 409);
    const language = target() ?? '';
    const level = fields.get(`${language}/starting_level`) as string | undefined;
    const exam = fields.get(`${language}/exam`) as
      { type: string; target_level: string | null; date: string | null } | null | undefined;
    const known = FAKE_CATALOG.languages
      .find(({ code }) => code === language)
      ?.exams.find(({ id }) => id === exam?.type);
    const daysLeft = exam?.date
      ? Math.round((Date.parse(exam.date) - Date.parse(dayOf(FAKE_NOW))) / DAY_MS)
      : null;
    const partners: HomePartner[] = (personas ?? []).map((persona) => {
      const met = counted().filter((conversation) => conversation.partner?.id === persona.id);
      return {
        persona,
        conversations: met.length,
        lastTalkedAt: met[0]?.startedAt ?? null,
      };
    });
    return {
      language,
      level: level
        ? {
            level: level as NonNullable<Home['level']>['level'],
            source: sources.get(`${language}/starting_level`) ?? 'asked',
            skills: result?.levels ?? null,
          }
        : null,
      ...focus(),
      cardsDue: dueCards().length,
      exam:
        exam && (daysLeft === null || daysLeft >= 0)
          ? {
              type: exam.type,
              name: known?.name ?? null,
              targetLevel: exam.target_level as NonNullable<Home['exam']>['targetLevel'],
              date: exam.date,
              daysLeft,
            }
          : null,
      partners,
      suggestedPartnerId: counted()[0]?.partner?.id ?? personas?.[0]?.id ?? null,
      activity: activity(),
      recent: counted().slice(0, RECENT_CONVERSATIONS),
      reminders: reminderNotes,
      // What was done this week moves the plan on, as on the server.
      plan: {
        ...plan,
        doneMinutes: Math.floor(activity().weekSeconds / 60),
        doneDays: activity().week.filter((day) => day.seconds > 0).length,
        ...planChanges,
      },
    };
  }

  const account = () => ({ picture: picture ? { url: picture } : null, owner });

  const memoryBook = (): Memories => ({
    enabled: memoryEnabled,
    avoidTopics: [...avoidTopics],
    memories: [...memories],
  });

  /** A new partner at the end of the list, unless the list is full. */
  function add(fields: PersonaDraft): Persona {
    if (!target()) throw new ApiError('no_language', 409);
    if ((personas ?? []).length >= MAX_PARTNERS) throw new ApiError('too_many', 409);
    if (!fields.name.trim()) throw new ApiError('invalid_value', 422);
    created += 1;
    const added: Persona = {
      ...fields,
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(created).padStart(12, '0')}`,
    };
    personas = [...(personas ?? []), added];
    return added;
  }

  return {
    calls,
    get deleted() {
      return deleted;
    },
    uploads,
    havePicture() {
      picture = `${FILES}/users/amara/picture/earlier.jpg`;
    },
    usedMinutes(minutes) {
      usedSeconds += minutes * 60;
    },
    beOwner() {
      owner = true;
    },
    planned(changes) {
      planChanges = { ...planChanges, ...changes };
    },
    noted(changes) {
      reminderNotes = { ...reminderNotes, ...changes };
    },
    simulated(callId, { status = 'ready', result, daysAgo = 0, scores = 'ready' } = {}) {
      simulations.set(callId, {
        callId,
        exam: 'goethe_b1',
        cards: FAKE_EXAM_CARDS,
        startedAt: new Date(Date.parse(FAKE_NOW) - daysAgo * DAY_MS).toISOString(),
        status,
        result: status === 'ready' ? (result ?? FAKE_SIMULATION_RESULT) : null,
      });
      scoring.set(callId, scores);
    },
    practisedLastWeek(review = {}, writes = 'ready') {
      lastWeek = { ...FAKE_WEEK_REVIEW, ...review };
      weekWrites = writes;
    },
    spent(costs) {
      months.set(costs.month, costs);
    },
    failNext: (method, code, field) =>
      void failures.set(method, new ApiError(code, code === 'network' ? 0 : 422, field ?? null)),
    answer: apply,
    hold(method) {
      let release = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      if (method) methodGates.set(method, held);
      else gate = held;
      return release;
    },
    assess(status, measured = FAKE_RESULT) {
      const hasResult = status === 'measured' || status === 'decided';
      result = hasResult ? measured : null;
      if (status === 'decided') startAt(measured.overall, status, 'measured');
      else placement = status;
    },
    advanceTo(stage) {
      if (!target()) apply(ESSENTIAL_ANSWERS);
      essentialsConfirmed = true;
      if (stage === 'placement') return;
      // A learner who has not settled their level by the test has postponed it.
      if (placement !== 'decided') startAt(ownLevel(), 'skipped', 'asked');
      if (stage === 'partners') return;
      personas = FAKE_PERSONAS.slice(0, 2);
      partnersConfirmed = true;
    },
    enterApp({ measured = false, exam } = {}) {
      if (!target()) apply(ESSENTIAL_ANSWERS);
      if (exam !== undefined) apply([{ field: 'exam', value: exam }]);
      essentialsConfirmed = true;
      if (measured) {
        result = FAKE_RESULT;
        startAt(FAKE_RESULT.overall, 'decided', 'measured');
      } else {
        startAt(ownLevel(), 'skipped', 'asked');
      }
      personas = FAKE_PERSONAS.slice(0, exam ? 3 : 2);
      partnersConfirmed = true;
      completed = true;
    },
    talked(
      partner,
      {
        id = `rtc_${practice.length + 1}`,
        daysAgo = 0,
        hoursAgo = 1,
        minutes = 5,
        learnerSays = ['Gut, danke! Und dir?'],
        ended = true,
        recorded = false,
        verbatim,
        scenario = null,
        goalsReached = [],
      } = {},
    ) {
      const started = now - daysAgo * DAY_MS - hoursAgo * 60 * MINUTE_MS;
      const conversation: Conversation = {
        id,
        partner: personas?.[partner] ?? null,
        startedAt: new Date(started).toISOString(),
        endedAt: ended ? new Date(started + minutes * MINUTE_MS).toISOString() : null,
        seconds: ended ? minutes * 60 : 0,
        learnerTurns: ended ? learnerSays.length : 0,
        scenario,
        goalsReached,
      };
      practice.push({
        conversation,
        turns: ended ? turnsOf(learnerSays, recorded ? id : undefined, verbatim) : [],
      });
      return conversation;
    },
    finish(id, { minutes = 5, learnerSays = ['Gut, danke! Und dir?'] } = {}) {
      const entry = practice.find(({ conversation }) => conversation.id === id);
      if (!entry) throw new Error(`fake api: no call ${id}`);
      const ended = Date.parse(entry.conversation.startedAt) + minutes * MINUTE_MS;
      entry.conversation = {
        ...entry.conversation,
        endedAt: new Date(ended).toISOString(),
        seconds: minutes * 60,
        learnerTurns: learnerSays.length,
      };
      entry.turns = turnsOf(learnerSays);
    },

    async learning() {
      const { id } = this.talked(0, { learnerSays: FAKE_REPORT_SAYS });
      this.reported(id);
      for (const source of [
        { kind: 'word', index: 0 },
        { kind: 'word', index: 1 },
        { kind: 'correction', index: 0 },
      ] as const) {
        await this.saveCard({ conversationId: id, ...source });
      }
      // The saving above is not what a test wants to count.
      calls.length = 0;
      return [...cards];
    },
    remembering(known = FAKE_MEMORIES) {
      memories = [...known];
    },
    leveled(points) {
      levelHistory = [...points];
    },
    reported(id, state = FAKE_REPORT) {
      reports.set(
        id,
        typeof state === 'string'
          ? { status: state, report: null }
          : { status: 'ready', report: state },
      );
    },

    async getCatalog() {
      await record('getCatalog');
      return FAKE_CATALOG;
    },
    async getProfile() {
      await record('getProfile');
      return profile();
    },
    async updateProfile(changes) {
      await record('updateProfile', changes);
      apply(changes);
      // Whatever the form sends is, from now on, what the learner told us.
      for (const change of changes) {
        if (change.field !== 'target_language') {
          sources.delete(`${change.scope ?? target()}/${change.field}`);
        }
      }
      return profile();
    },
    async getOnboarding() {
      await record('getOnboarding');
      return onboarding();
    },
    async confirmEssentials() {
      await record('confirmEssentials');
      if (onboarding().missing.length) throw new ApiError('essentials_incomplete', 409);
      essentialsConfirmed = true;
      return onboarding();
    },
    async startVoiceCall(purpose, sdp, { personaId, practise, scenario } = {}) {
      await record('startVoiceCall', purpose, sdp, personaId);
      if (purpose === 'placement') placement = 'in_progress';
      if (purpose === 'exam' && !FAKE_SPEAKING_EXAMS.some(({ id }) => id === scenario)) {
        throw new ApiError('not_found', 404);
      }
      if (purpose === 'practice' && !personas?.some(({ id }) => id === personaId)) {
        throw new ApiError('not_found', 404);
      }
      const left = FAKE_WEEKLY_SECONDS - usedSeconds;
      if (left < MIN_CALL_SECONDS) throw new ApiError('minutes_used_up', 429);
      const maxSeconds = Math.min(['practice', 'exam'].includes(purpose) ? 600 : 480, left);
      usedSeconds += maxSeconds;
      // Nothing to plan from yet: no reports in the fake. A review brings the due words.
      const review = practise === 'words';
      const words = review ? dueCards().filter(({ kind }) => kind === 'word') : [];
      const plan =
        purpose === 'practice'
          ? {
              language: 'de',
              focus: [],
              words: words.map(({ front, back }) => ({ text: front, meaning: back })),
              review,
            }
          : null;
      return { callId: 'rtc_fake', sdp: 'v=0 answer', maxSeconds, plan };
    },
    async getHome(timeZone) {
      await record('getHome', timeZone);
      return home();
    },
    async getProgress(timeZone) {
      await record('getProgress', timeZone);
      return progress();
    },
    async getExamCentre(): Promise<ExamCentre> {
      await record('getExamCentre');
      const language = target() ?? '';
      const exam = fields.get(`${language}/exam`) as
        { type: string; target_level: string | null; date: string | null } | null | undefined;
      const suggested = exam
        ? FAKE_SPEAKING_EXAMS.find(
            (format) =>
              format.exam === exam.type &&
              (format.levels.length > 1 || format.levels.includes(exam.target_level ?? '')),
          )
        : undefined;
      const done = [...simulations.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const scored = done.filter((simulation) => simulation.result);
      const latest = scored[0]?.result;
      return {
        language,
        exam: exam ? { type: exam.type, targetLevel: exam.target_level, date: exam.date } : null,
        suggested: suggested?.id ?? null,
        formats: FAKE_SPEAKING_EXAMS,
        simulations: done.map(({ callId, exam: id, startedAt, status, result }) => ({
          callId,
          exam: id,
          startedAt,
          status,
          total: result?.total ?? null,
          passed: result?.passed ?? null,
        })),
        readiness: latest
          ? {
              goethe_b1: {
                latest: latest.total,
                change: scored[1]?.result ? latest.total - scored[1].result.total : null,
                passing: latest.passed,
                weakest: 'teil_2',
                readyOn: null,
              },
            }
          : {},
      };
    },
    async getNextSimulation(exam) {
      await record('getNextSimulation', exam);
      const found = FAKE_SPEAKING_EXAMS.find(({ id }) => id === exam);
      if (!found) throw new ApiError('not_found', 404);
      return { exam: found, cards: FAKE_EXAM_CARDS };
    },
    async getSimulation(callId) {
      await record('getSimulation', callId);
      const found = simulations.get(callId);
      if (!found) throw new ApiError('not_found', 404);
      // The worker finishes between two reads.
      const outcome = scoring.get(callId) ?? 'ready';
      if (found.status === 'pending' && outcome !== 'pending') {
        simulations.set(callId, {
          ...found,
          status: outcome,
          result: outcome === 'ready' ? FAKE_SIMULATION_RESULT : null,
        });
      }
      return found;
    },
    async rescoreSimulation(callId) {
      await record('rescoreSimulation', callId);
      const found = simulations.get(callId);
      if (!found) throw new ApiError('not_found', 404);
      const asked: Simulation = found.status === 'failed' ? { ...found, status: 'pending' } : found;
      simulations.set(callId, asked);
      scoring.set(callId, 'ready');
      return asked;
    },
    async getModelAnswerAudio(callId, part) {
      await record('getModelAnswerAudio', callId, part);
      if (simulations.get(callId)?.status !== 'ready') throw new ApiError('not_found', 404);
      return { url: `https://files.test/exams/${callId}/${part}.mp3` };
    },
    async requestWeekReview(week, timeZone) {
      await record('requestWeekReview', week, timeZone);
      if (!lastWeek) throw new ApiError('nothing_to_report', 409);
      if (lastWeek.numbers.week !== week) throw new ApiError('not_found', 404);
      if (lastWeek.status === 'none' || lastWeek.status === 'failed') {
        lastWeek = { ...lastWeek, status: 'pending' };
      }
      return lastWeek;
    },
    async getWeekReview(week, timeZone) {
      await record('getWeekReview', week, timeZone);
      if (!lastWeek || lastWeek.numbers.week !== week) throw new ApiError('not_found', 404);
      const shown = lastWeek;
      // The worker finishes between two reads.
      if (lastWeek.status === 'pending' && weekWrites !== 'pending') {
        lastWeek =
          weekWrites === 'ready'
            ? { ...lastWeek, status: 'ready', text: FAKE_WEEK_TEXT }
            : { ...lastWeek, status: 'failed' };
      }
      return shown;
    },
    async getWeekReviewAudio(week) {
      await record('getWeekReviewAudio', week);
      if (lastWeek?.status !== 'ready' || lastWeek.numbers.week !== week) {
        throw new ApiError('not_found', 404);
      }
      return { url: `https://files.test/weeks/${week}.mp3` };
    },
    async getConversations({ before, limit = PAGE_DEFAULT } = {}) {
      await record('getConversations', { before, limit });
      const older = counted().filter((conversation) => !before || conversation.startedAt < before);
      const page = older.slice(0, limit);
      return {
        conversations: page,
        next: older.length > limit ? (page.at(-1)?.startedAt ?? null) : null,
      };
    },
    async getConversation(id) {
      await record('getConversation', id);
      const entry = practice.find(({ conversation }) => conversation.id === id);
      if (!entry) throw new ApiError('not_found', 404);
      return { conversation: entry.conversation, turns: entry.turns };
    },
    async getConversationReport(id) {
      await record('getConversationReport', id);
      if (!practice.some(({ conversation }) => conversation.id === id)) {
        throw new ApiError('not_found', 404);
      }
      const stands = reports.get(id) ?? { status: 'none', report: null };
      const report = stands.report;
      if (!report) return stands;
      // As on the server: each word and mistake says whether the learner has it as a card.
      return {
        ...stands,
        report: {
          ...report,
          words: report.words.map((word) => ({ ...word, saved: hasCard('word', word.text) })),
          mistakes: report.mistakes.map((mistake) => ({
            ...mistake,
            saved: hasCard('correction', mistake.original),
          })),
        },
      };
    },
    async saveCard({ conversationId, kind, index }) {
      await record('saveCard', { conversationId, kind, index });
      if (!practice.some(({ conversation }) => conversation.id === conversationId)) {
        throw new ApiError('not_found', 404);
      }
      const report = reports.get(conversationId)?.report;
      if (!report) throw new ApiError('no_report', 409);
      const word = kind === 'word' ? report.words[index] : undefined;
      const mistake = kind === 'correction' ? report.mistakes[index] : undefined;
      if (!word && !mistake) throw new ApiError('no_such_item', 422);
      if (mistake && !mistake.certain) throw new ApiError('not_certain', 422);
      const front = word?.text ?? mistake?.original ?? '';
      const known = cards.find(
        (card) => card.kind === kind && cardKey(card.front) === cardKey(front),
      );
      if (known) return known;
      // A second apart, so that the newest card is always the last one made.
      const made = new Date(now + cards.length * 1000).toISOString();
      const card: Card = {
        id: `card_${cards.length + 1}`,
        kind,
        front,
        back: word?.meaning ?? mistake?.corrected ?? '',
        note: word ? word.example : (mistake?.explanation ?? null),
        explainedIn: report.language,
        conversationId,
        createdAt: made,
        dueAt: new Date(now).toISOString(),
        reviewedAt: null,
        reviews: 0,
        lapses: 0,
        // The worker writes a word's forms a moment later; the fake knows a few at once.
        details: word ? (FAKE_WORD_FORMS[word.text] ?? null) : null,
      };
      cards.push(card);
      return card;
    },
    async getCards({ before, limit = CARDS_PAGE_DEFAULT } = {}) {
      await record('getCards', { before, limit });
      const newestFirstCards = [...cards].reverse();
      const older = newestFirstCards.filter((card) => !before || card.createdAt < before);
      const page = older.slice(0, limit);
      return {
        cards: page,
        next: older.length > limit ? (page.at(-1)?.createdAt ?? null) : null,
        ...deckSummary(),
      };
    },
    async getDueCards(limit = QUEUE_DEFAULT) {
      await record('getDueCards', limit);
      const dueIn = Object.fromEntries(
        Object.entries(FAKE_DUE_IN_MS).map(([rating, ms]) => [rating, ms / 1000]),
      ) as Record<Rating, number>;
      return {
        cards: dueCards()
          .slice(0, limit)
          .map((card) => ({ card, dueIn })),
        due: dueCards().length,
        language: 'de',
      };
    },
    async reviewCard(id, rating) {
      await record('reviewCard', id, rating);
      const card = cards.find((candidate) => candidate.id === id);
      if (!card) throw new ApiError('not_found', 404);
      const reviewed: Card = {
        ...card,
        dueAt: new Date(now + FAKE_DUE_IN_MS[rating]).toISOString(),
        reviewedAt: new Date(now).toISOString(),
        reviews: card.reviews + 1,
      };
      cards = cards.map((candidate) => (candidate.id === id ? reviewed : candidate));
      reviewLog.push({ id, rating });
      return reviewed;
    },
    async removeCard(id) {
      await record('removeCard', id);
      if (!cards.some((card) => card.id === id)) throw new ApiError('not_found', 404);
      cards = cards.filter((card) => card.id !== id);
      reviewLog = reviewLog.filter((review) => review.id !== id);
      return deckSummary();
    },
    async requestConversationReport(id) {
      await record('requestConversationReport', id);
      const entry = practice.find(({ conversation }) => conversation.id === id);
      if (!entry) throw new ApiError('not_found', 404);
      if (!entry.conversation.endedAt || entry.conversation.learnerTurns === 0) {
        throw new ApiError('nothing_to_report', 409);
      }
      const known = reports.get(id);
      if (known && known.status !== 'failed') return known;
      const pending: ConversationReport = { status: 'pending', report: null };
      reports.set(id, pending);
      return pending;
    },
    async getMemories() {
      await record('getMemories');
      return memoryBook();
    },
    async configureMemories(settings) {
      await record('configureMemories', settings);
      if (settings.avoidTopics) {
        const topics = settings.avoidTopics.map((topic) => topic.trim().replace(/\s+/g, ' '));
        const distinct = new Set(topics.map((topic) => topic.toLowerCase()));
        if (
          topics.some((topic) => !topic) ||
          distinct.size !== topics.length ||
          topics.length > MAX_AVOID_TOPICS
        ) {
          throw new ApiError('invalid_value', 422, 'avoid_topics');
        }
        avoidTopics = topics;
      }
      if (settings.enabled !== undefined) memoryEnabled = settings.enabled;
      return memoryBook();
    },
    askedTutor(questions) {
      for (const { question, answer, minutesAgo = 60 } of questions) {
        tutorAnswer = { ...FAKE_TUTOR_ANSWER, ...answer };
        keepQuestion(question, 'text', now - minutesAgo * MINUTE_MS);
      }
    },
    nextTutorAnswer(answer) {
      tutorAnswer = { ...FAKE_TUTOR_ANSWER, ...answer };
    },
    async getTutorQuestions() {
      await record('getTutorQuestions');
      return { questions: tutorQuestions };
    },
    hearsNextRetry(heard) {
      nextRetryHeard = heard;
    },
    async retryCorrection(conversationId, index, attempt) {
      await record('retryCorrection', conversationId, index, attempt);
      const mistake = FAKE_REPORT.mistakes[index];
      if (!mistake) throw new ApiError('not_found', 404);
      if (!mistake.certain) throw new ApiError('unsure', 409);
      const heard = nextRetryHeard ?? mistake.corrected;
      nextRetryHeard = null;
      const right = heard.includes(mistake.corrected) && !heard.includes(mistake.original);
      const tried = retried.get(conversationId) ?? new Map<number, boolean>();
      tried.set(index, (tried.get(index) ?? false) || right);
      retried.set(conversationId, tried);
      return { heard, right, said: mistake.original, better: mistake.corrected };
    },
    async getRetries(conversationId) {
      await record('getRetries', conversationId);
      const tried = retried.get(conversationId) ?? new Map<number, boolean>();
      return { retries: [...tried].map(([index, right]) => ({ index, right })) };
    },
    hearsNextAnswer(heard) {
      nextAnswerHeard = heard;
    },
    async answerCard(id, answer) {
      await record('answerCard', id, answer);
      const card = cards.find((one) => one.id === id);
      if (!card) throw new ApiError('not_found', 404);
      const expected = card.kind === 'word' ? card.front : card.back;
      const heard = nextAnswerHeard ?? expected;
      nextAnswerHeard = null;
      if (heard instanceof ApiError) throw heard;
      // The server's check, roughly: the words together, or a noun's without its article.
      const said = heard.toLowerCase();
      const word = expected.toLowerCase();
      const bare = word.replace(/^(der|die|das) /, '');
      const outcome = said.includes(word)
        ? 'right'
        : bare !== word && said.includes(bare)
          ? 'article'
          : 'wrong';
      const suggested = ({ right: 'good', article: 'hard', wrong: 'again' } as const)[outcome];
      return { heard, outcome, expected, suggested };
    },
    async registerPushDevice(device) {
      await record('registerPushDevice', device);
      return { registered: true };
    },
    async removePushDevice(token) {
      await record('removePushDevice', token);
      return { registered: false };
    },
    async getCard(id) {
      await record('getCard', id);
      const card = cards.find((saved) => saved.id === id);
      if (!card) throw new ApiError('not_found', 404);
      return card;
    },
    async getCardAudio(id) {
      await record('getCardAudio', id);
      if (!cards.some((card) => card.id === id)) throw new ApiError('not_found', 404);
      return { url: `https://files.test/cards/${id}.mp3` };
    },
    async getGrammarMap() {
      await record('getGrammarMap');
      return FAKE_GRAMMAR_MAP;
    },
    async getGrammarTopic(id) {
      await record('getGrammarTopic', id);
      const page = fakeGrammarTopic(id);
      if (!page) throw new ApiError('not_found', 404);
      return page;
    },
    async askTutor(question) {
      await record('askTutor', question);
      const text = question.trim();
      if (!text || text.length > 500) throw new ApiError('invalid_value', 422);
      return keepQuestion(text, 'text', now);
    },
    async explainCorrection(conversationId, index) {
      await record('explainCorrection', conversationId, index);
      const mistake = reports.get(conversationId)?.report?.mistakes[index];
      if (!mistake) throw new ApiError('not_found', 404);
      return keepQuestion(`${mistake.original} → ${mistake.corrected}`, 'report', now);
    },
    async getRecordings() {
      await record('getRecordings');
      return { kept: recordingsKept };
    },
    async configureRecordings(kept) {
      await record('configureRecordings', kept);
      recordingsKept = kept;
      // As on the server: keeping none deletes the ones there are.
      if (!kept) {
        for (const entry of practice) {
          entry.turns = entry.turns.map((turn) => ({ ...turn, audio: null }));
        }
      }
      return { kept: recordingsKept };
    },
    async changeMemory(id, change) {
      await record('changeMemory', id, change);
      const current = memories.find((memory) => memory.id === id);
      if (!current) throw new ApiError('not_found', 404);
      const text = change.text === undefined ? current.text : change.text.trim();
      if (!wording(text) || text.length > MEMORY_TEXT_MAX) throw new ApiError('invalid_value', 422);
      if (change.day && current.kind !== 'event') throw new ApiError('invalid_value', 422);
      const same = (other: Memory) =>
        other.id !== id &&
        other.partnerId === current.partnerId &&
        wording(other.text) === wording(text);
      if (memories.some(same)) throw new ApiError('duplicate', 409);
      const changed: Memory = {
        ...current,
        text,
        day: change.day === undefined ? current.day : change.day,
        updatedAt: new Date(now).toISOString(),
      };
      memories = memories.map((memory) => (memory.id === id ? changed : memory));
      return changed;
    },
    async removeMemory(id) {
      await record('removeMemory', id);
      if (!memories.some((memory) => memory.id === id)) throw new ApiError('not_found', 404);
      memories = memories.filter((memory) => memory.id !== id);
      return memoryBook();
    },
    async getPlacement() {
      await record('getPlacement');
      return placementView();
    },
    async skipPlacement() {
      await record('skipPlacement');
      requireStage('placement');
      startAt(ownLevel(), 'skipped', 'asked');
      return onboarding();
    },
    async decidePlacement(use) {
      await record('decidePlacement', use);
      if (placement !== 'measured' || !result) throw new ApiError('wrong_stage', 409);
      if (use === 'measured') startAt(result.overall, 'decided', 'measured');
      else startAt(ownLevel(), 'decided', 'asked');
      return onboarding();
    },
    async proposeStarterPersonas() {
      await record('proposeStarterPersonas');
      requireStage('partners');
      // An exam coach only for a learner who is preparing an exam, as on the server.
      const exam = fields.get(`${target()}/exam`) != null;
      personas ??= FAKE_PERSONAS.filter(({ role }) => exam || role !== 'exam_coach');
      return personas;
    },
    async getPersonas() {
      await record('getPersonas');
      return personas ?? [];
    },
    async changePersona(id, change) {
      await record('changePersona', id, change);
      const current = persona(id);
      const role = change.role ?? current.role;
      const changed: Persona = {
        ...current,
        ...change,
        // Null hands the settings back to the role, as on the server.
        personality:
          change.personality === null ? BALANCED : (change.personality ?? current.personality),
        teaching:
          change.teaching === null ? ROLE_TEACHING[role] : (change.teaching ?? current.teaching),
      };
      if (!changed.name.trim()) throw new ApiError('invalid_value', 422, 'name');
      personas = (personas ?? []).map((candidate) => (candidate.id === id ? changed : candidate));
      return changed;
    },
    async createPersona(fields) {
      await record('createPersona', fields);
      return add({
        ...fields,
        occupation: fields.occupation ?? '',
        tagline: fields.tagline ?? null,
        personality: fields.personality ?? BALANCED,
        teaching: fields.teaching ?? ROLE_TEACHING[fields.role],
      });
    },
    async draftPersona(description) {
      await record('draftPersona', description);
      if (drafts >= DRAFTS_PER_DAY) throw new ApiError('draft_limit', 429);
      drafts += 1;
      return FAKE_DRAFT;
    },
    async getPersonaTemplates() {
      await record('getPersonaTemplates');
      return target() ? FAKE_TEMPLATES : [];
    },
    async duplicatePersona(id) {
      await record('duplicatePersona', id);
      const original = persona(id);
      const names = new Set((personas ?? []).map(({ name }) => name));
      let number = 2;
      while (names.has(`${original.name} ${number}`)) number += 1;
      return add({ ...draftOf(original), name: `${original.name} ${number}` });
    },
    async getVoiceSample(voice) {
      await record('getVoiceSample', voice);
      return `${FILES}/voices/de/${voice}.mp3`;
    },
    async getAccount() {
      await record('getAccount');
      return account();
    },
    async getVoiceAllowance() {
      await record('getVoiceAllowance');
      return {
        weeklySeconds: FAKE_WEEKLY_SECONDS,
        usedSeconds,
        remainingSeconds: Math.max(0, FAKE_WEEKLY_SECONDS - usedSeconds),
        resetsAt: FAKE_WEEK_ENDS,
      };
    },
    async getCosts(month = FAKE_COSTS.month) {
      await record('getCosts', month);
      if (!owner) throw new ApiError('not_owner', 403);
      return (
        months.get(month) ?? {
          ...FAKE_COSTS,
          month,
          level: 'normal',
          totalUsd: 0,
          days: [],
          features: [],
          providers: [],
          learners: [],
        }
      );
    },
    async startPictureUpload() {
      await record('startPictureUpload');
      const uploadId = `bbbbbbbb-bbbb-4bbb-8bbb-${String(uploads.length + 1).padStart(12, '0')}`;
      uploads.push(uploadId);
      return {
        uploadId,
        url: `${FILES}/`,
        fields: { key: `uploads/amara/${uploadId}.jpg`, 'Content-Type': 'image/jpeg' },
      };
    },
    async confirmPicture(uploadId) {
      await record('confirmPicture', uploadId);
      if (!uploads.includes(uploadId)) throw new ApiError('upload_not_found', 404);
      picture = `${FILES}/users/amara/picture/${uploadId}.jpg`;
      return account();
    },
    async removePicture() {
      await record('removePicture');
      picture = null;
      return account();
    },
    async deleteAccount() {
      await record('deleteAccount');
      deleted = true;
    },
    async removePersona(id) {
      await record('removePersona', id);
      persona(id);
      personas = (personas ?? []).filter((candidate) => candidate.id !== id);
      // As on the server: the conversations stay, without their partner.
      for (const entry of practice) {
        if (entry.conversation.partner?.id === id) {
          entry.conversation = { ...entry.conversation, partner: null };
        }
      }
      return personas;
    },
    async confirmPartners() {
      await record('confirmPartners');
      requireStage('partners');
      if (!personas?.length) throw new ApiError('no_partners', 409);
      partnersConfirmed = true;
      return onboarding();
    },
    async completeOnboarding() {
      await record('completeOnboarding');
      if (!completed) requireStage('ready');
      completed = true;
      return onboarding();
    },
  };
}

/** The seven essential answers of a typical learner, as profile changes. */
export const ESSENTIAL_ANSWERS: ProfileChange[] = [
  { field: 'target_language', value: 'de' },
  { field: 'explanation_language', value: 'en' },
  { field: 'explanation_usage', value: 'when_stuck' },
  { field: 'goals', value: { reasons: ['work'], note: null } },
  { field: 'exam', value: null },
  { field: 'self_assessed_level', value: 'A2' },
  { field: 'course', value: null },
];
