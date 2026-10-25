import type { components } from './schema.ts';

type Schemas = components['schemas'];

export type Catalog = Schemas['CatalogOut'];
export type CatalogLanguage = Schemas['LanguageOut'];
export type CatalogExam = Schemas['ExamOut'];
export type Profile = Schemas['ProfileOut'];
export type ProfileField = Schemas['FieldOut'];
export type ProfileChange = Schemas['ChangeIn'];
export type ProfileSource = Schemas['Source'];
export type Onboarding = Schemas['OnboardingOut'];
export type OnboardingStage = Schemas['Stage'];
export type CallPurpose = Schemas['CallPurpose'];
export type VoiceCall = Schemas['VoiceCallOut'];
/** What a practice conversation sets out to practise: kinds of mistake and words to use. */
export type CallPlan = Schemas['CallPlanOut'];
/** What a call may say about itself beyond its purpose and offer. */
export interface VoiceCallDetails {
  /** The partner of a practice call. */
  personaId?: string;
  /** Today on the device's calendar ("2026-10-10"), so a persona names the right weekday. */
  localDate?: string;
  /** A practice call that rehearses a role-play: a scenario id from the catalog. */
  scenario?: string;
  /** A practice call that practises a grammar topic first: a topic id of the grammar map. */
  practise?: string;
}
/** One attempt at saying a report's correction again ("Say it better"), as the server heard it. */
export type Retried = Schemas['RetriedOut'];
/** A recording of the attempt, made on the device. */
export type RetryAttempt = Schemas['RetryIn'];
/** The corrections of a report the learner said again, and whether they got one right. */
export type Retries = Schemas['RetriesOut'];
/** Every grammar topic of the language learned, with how well the learner has it (spec §6.8). */
export type GrammarMap = Schemas['GrammarMapOut'];
export type GrammarTopic = Schemas['GrammarTopicOut'];
export type GrammarMastery = GrammarTopic['mastery'];
/** One topic of the map, with examples and the learner's own mistakes on it. */
export type GrammarTopicPage = Schemas['GrammarTopicPageOut'];
export type Placement = Schemas['PlacementOut'];
/** A role-play a language offers: its id, level and goal ids (the app names them). */
export type Scenario = Schemas['ScenarioOut'];
export type PlacementStatus = Schemas['PlacementStatus'];
export type PlacementResult = Schemas['PlacementResultOut'];
export type PlacementChoice = Schemas['PlacementDecision']['use'];
export type Persona = Schemas['PersonaOut'];
export type PersonaRole = Persona['role'];
export type PersonaGender = Persona['gender'];
export type PersonaVoice = Persona['voice'];
export type PersonaLook = Schemas['LookModel'];
/** How a persona comes across: five traits from 1 to 5, a form of address and a style. */
export type PersonaPersonality = Schemas['PersonalityModel'];
/** How a persona treats mistakes and adapts to the learner. */
export type PersonaTeaching = Schemas['TeachingModel'];
/** A persona that is not saved: a template, or one written from a description. */
export type PersonaDraft = Schemas['PersonaDraftOut'];
/** A new persona. Personality and teaching left out: as their role does. */
export type PersonaInput = Schemas['PersonaIn'];
/**
 * The parts of a persona to change; the ones left out stay. `personality` or `teaching` set to
 * null go back to what the persona's role does.
 */
export type PersonaChange = Partial<PersonaInput>;
/** What the backend keeps for an account: the learner's photo. */
export type Account = Schemas['AccountOut'];
/** How to send a photo: a form POST to `url` with `fields`, then the JPEG as `file`. */
export type PictureUpload = Schemas['PictureUploadOut'];
export type Home = Schemas['HomeOut'];
export type HomeLevel = Schemas['HomeLevelOut'];
export type HomeExam = Schemas['HomeExamOut'];
export type HomePartner = Schemas['HomePartnerOut'];
export type Activity = Schemas['ActivityOut'];
export type ActivityDay = Schemas['DayOut'];
/** The Progress screen in one answer. */
export type Progress = Schemas['ProgressOut'];
/** One level on the way, from when it was set and by whom. */
export type LevelPoint = Schemas['LevelPointOut'];
export type ProgressWeek = Schemas['WeekOut'];
export type MistakeKind = Schemas['MistakeKindOut'];
export type Milestone = Schemas['MilestoneOut'];
export type Conversation = Schemas['ConversationOut'];
export type ConversationPage = Schemas['ConversationsOut'];
export type Transcript = Schemas['TranscriptOut'];
export type TranscriptTurn = Schemas['TurnOut'];
/** A conversation's Session Report, or how far it is (`status`). */
export type ConversationReport = Schemas['ReportOut'];
export type ReportStatus = ConversationReport['status'];
export type SessionReport = Schemas['SessionReportOut'];
/** The level a conversation's evidence moved the learner to (spec §6.9). */
export type LevelStep = Schemas['LevelStepOut'];
export type ReportMistake = Schemas['ReportMistakeOut'];
export type ReportRewrite = Schemas['ReportRewriteOut'];
export type ReportWord = Schemas['ReportWordOut'];
/** A flashcard: a word with its meaning, or a sentence the learner said and how it is right. */
export type Card = Schemas['CardOut'];
export type CardKind = Card['kind'];
/** Which word or correction of a conversation's report to make a card of. */
export type CardSource = Schemas['CardIn'];
export type Deck = Schemas['DeckOut'];
export type DeckSummary = Schemas['DeckSummaryOut'];
/** The cards to review now, each with when it would come back for every rating. */
export type ReviewQueue = Schemas['QueueOut'];
export type ReviewCard = Schemas['QueueCardOut'];
export type Rating = Schemas['ReviewIn']['rating'];
/** Something the learner's partners know about them from an earlier conversation. */
export type Memory = Schemas['MemoryOut'];
export type MemoryKind = Memory['kind'];
/** Everything the partners know, whether memory is on, and the topics they leave alone. */
export type Memories = Schemas['MemoriesOut'];
/** The settings to change; the ones left out stay. */
export type MemorySettings = { enabled?: boolean; avoidTopics?: string[] };
/** A question asked to the Tutor and its answer. */
export type TutorQuestion = Schemas['TutorQuestionOut'];
export type TutorAnswer = Schemas['TutorAnswerOut'];
/** Whether the audio of the learner's conversations is kept for them to hear again. */
export type Recordings = Schemas['RecordingsOut'];
export type VoiceAllowance = Schemas['AllowanceOut'];
export type Costs = Schemas['CostsOut'];
export type CostLevel = Costs['level'];
/** A turn's recording: a short-lived address to play it from, and how long it lasts. */
export type TurnAudio = Schemas['TurnAudioOut'];
/** What to change about one memory; `day: null` takes an event's day away. */
export type MemoryChange = { text?: string; day?: string | null };

/**
 * Why a call failed. Codes the server sends (`invalid_value`, `essentials_incomplete`, …) pass
 * through unchanged; the ones below are decided here.
 */
export type ClientErrorCode =
  'network' | 'not_authenticated' | 'not_configured' | 'rate_limited' | 'waking_up' | 'unknown';

/**
 * Carries a code, the HTTP status and, for a refused value, the field. Never a message from the
 * server or any request data, so it can be logged or shown safely.
 */
export class ApiError extends Error {
  readonly code: ClientErrorCode | (string & {});
  /** 0 when no answer arrived. */
  readonly status: number;
  readonly field: string | null;

  constructor(code: ApiError['code'], status = 0, field: string | null = null) {
    super(`API error: ${code}`);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

export interface ApiClientOptions {
  /** The API's address (EXPO_PUBLIC_API_URL). */
  baseUrl: string;
  /** A working access token for the signed-in user. */
  getAccessToken: () => Promise<string>;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Waits between attempts while the backend wakes up. Replaced in tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface ApiClient {
  getCatalog(): Promise<Catalog>;
  getProfile(): Promise<Profile>;
  /** Applies all changes or none. Fails with `invalid_value` and the field for a refused one. */
  updateProfile(changes: ProfileChange[]): Promise<Profile>;
  getOnboarding(): Promise<Onboarding>;
  confirmEssentials(): Promise<Onboarding>;
  /** Where the placement test stands and, once assessed, its result. */
  getPlacement(): Promise<Placement>;
  /** Postpones the test: practice starts at the learner's own estimate. */
  skipPlacement(): Promise<Onboarding>;
  /** Starts at the measured level or at the learner's own estimate. */
  decidePlacement(use: PlacementChoice): Promise<Onboarding>;
  /**
   * The learner's starter partners: written for them on the first call (which can take a few
   * seconds), the same ones afterwards.
   */
  proposeStarterPersonas(): Promise<Persona[]>;
  getPersonas(): Promise<Persona[]>;
  /** Changes any part of a partner. Fails with `invalid_value` or `not_found`. */
  changePersona(id: string, change: PersonaChange): Promise<Persona>;
  /** Adds a partner. Fails with `invalid_value`, `too_many` (12 at most) or `no_language`. */
  createPersona(persona: PersonaInput): Promise<Persona>;
  /**
   * A partner written from the learner's description; nothing is saved. It can take a few
   * seconds. Fails with `invalid_value`, `draft_limit` (20 a day) or `writer_unavailable`.
   */
  draftPersona(description: string): Promise<PersonaDraft>;
  /** Ready-made partners of the language being learned. */
  getPersonaTemplates(): Promise<PersonaDraft[]>;
  /** A copy of a partner under the same name with the next free number. */
  duplicatePersona(id: string): Promise<Persona>;
  /**
   * A short-lived address of a voice's sample (MP3). The first request for a voice can take a
   * few seconds. Fails with `voice_unavailable`.
   */
  getVoiceSample(voice: PersonaVoice): Promise<string>;
  getAccount(): Promise<Account>;
  /** A form to send one photo with. It becomes the learner's photo with `confirmPicture`. */
  startPictureUpload(): Promise<PictureUpload>;
  /** Fails with `upload_not_found` or, for a file that is not a JPEG, `invalid_picture`. */
  confirmPicture(uploadId: string): Promise<Account>;
  removePicture(): Promise<Account>;
  /** Deletes the account and everything stored for it. This cannot be undone. */
  deleteAccount(): Promise<void>;
  /** Removes a partner and returns the ones that remain. */
  removePersona(id: string): Promise<Persona[]>;
  /** Fails with `no_partners` when none is left. */
  confirmPartners(): Promise<Onboarding>;
  completeOnboarding(): Promise<Onboarding>;
  /**
   * Creates a live voice call from the app's WebRTC offer (SDP) and returns the answer. A
   * practice call names the partner to talk to. Fails with `consent_required`, `call_limit`,
   * `voice_unavailable` or, for a partner the learner does not have, `not_found`.
   */
  startVoiceCall(purpose: CallPurpose, sdp: string, details?: VoiceCallDetails): Promise<VoiceCall>;
  /**
   * The Today screen in one answer. `timeZone` is the device's IANA zone ("Europe/Zurich"), so
   * days and the streak follow the learner's calendar.
   */
  getHome(timeZone?: string): Promise<Home>;
  /**
   * The Progress screen in one answer. `timeZone` is the device's, as for `getHome`: days and
   * weeks follow the learner's calendar.
   */
  getProgress(timeZone?: string): Promise<Progress>;
  /** Past conversations, newest first. `before` is the `next` of the page read before. */
  getConversations(page?: { before?: string; limit?: number }): Promise<ConversationPage>;
  /** One conversation and what was said in it. Fails with `not_found`. */
  getConversation(id: string): Promise<Transcript>;
  /** The report on one conversation, or how far it is. Fails with `not_found`. */
  getConversationReport(id: string): Promise<ConversationReport>;
  /**
   * Asks for a report that is not there (an earlier conversation, or one whose report failed).
   * Answers at once with its status; the report is written in the background. Fails with
   * `nothing_to_report`, `consent_required`, `unavailable` or, for a report that failed too
   * often, `report_limit`.
   */
  requestConversationReport(id: string): Promise<ConversationReport>;
  /**
   * Makes a flashcard of a word or a correction in a report; one that is a card already is
   * answered with that card. Fails with `no_report`, `no_such_item`, `not_certain` (a
   * correction nobody could confirm) or `too_many`.
   */
  saveCard(source: CardSource): Promise<Card>;
  /** The learner's cards, newest first. `before` is the `next` of the page read before. */
  getCards(page?: { before?: string; limit?: number }): Promise<Deck>;
  /** The cards that are due, the one that has waited longest first. */
  getDueCards(limit?: number): Promise<ReviewQueue>;
  /** Stores how well a card was known. Fails with `conflict` when it was reviewed meanwhile. */
  reviewCard(id: string, rating: Rating): Promise<Card>;
  /** Removes a card; answers with what is left of the deck. */
  removeCard(id: string): Promise<DeckSummary>;
  /** What the learner's partners know about them, newest first, and the memory settings. */
  getMemories(): Promise<Memories>;
  /** Turns memory on or off, or names the topics to leave alone. Fails with `invalid_value`. */
  configureMemories(settings: MemorySettings): Promise<Memories>;
  /**
   * Rewords a memory or moves an event's day. Fails with `invalid_value`, `duplicate` (another
   * memory says the same) or `not_found`.
   */
  changeMemory(id: string, change: MemoryChange): Promise<Memory>;
  /** Forgets a memory for good; answers with what is left. */
  removeMemory(id: string): Promise<Memories>;
  /** The questions asked to the Tutor, newest first. */
  getTutorQuestions(): Promise<{ questions: TutorQuestion[] }>;
  /**
   * Says correction `index` of a conversation's report again. Fails with `unsure`, `not_found`,
   * `invalid_value`, `retry_limit`, `consent_required` or `unavailable`.
   */
  retryCorrection(conversationId: string, index: number, attempt: RetryAttempt): Promise<Retried>;
  /** The corrections of a conversation's report the learner said again. */
  getRetries(conversationId: string): Promise<Retries>;
  /** The grammar map of the language learned. */
  getGrammarMap(): Promise<GrammarMap>;
  /** One topic of the map. Fails with `not_found` for a topic the language does not have. */
  getGrammarTopic(id: string): Promise<GrammarTopicPage>;
  /**
   * Asks the Tutor a question. Fails with `invalid_value`, `tutor_limit`, `consent_required` or
   * `unavailable`.
   */
  askTutor(question: string): Promise<TutorQuestion>;
  /** Asks the Tutor about correction `index` of a conversation's report. Fails as `askTutor`, or `not_found`. */
  explainCorrection(conversationId: string, index: number): Promise<TutorQuestion>;
  /** Whether recordings are kept. */
  getRecordings(): Promise<Recordings>;
  /** Keeps recordings or stops; stopping deletes every recording kept so far. */
  configureRecordings(kept: boolean): Promise<Recordings>;
  /** The learner's voice minutes this week (in seconds) and when they come back. */
  getVoiceAllowance(): Promise<VoiceAllowance>;
  /**
   * A month's estimated spending, for the owner only (fails with `not_owner`). `month` is the
   * first day of the month (`2026-09-01`); this month when left out.
   */
  getCosts(month?: string): Promise<Costs>;
}

// The dev database pauses when idle and needs about 15 seconds to wake. The server answers 503
// `waking_up` meanwhile; with its own waiting, this many attempts cover well over a minute.
const WAKE_UP_ATTEMPTS = 5;
const DEFAULT_RETRY_AFTER_SECONDS = 5;

// Answers that come from the gateway in front of the API, which does not use the API's error shape.
const GATEWAY_CODES: Record<number, ClientErrorCode> = {
  401: 'not_authenticated',
  403: 'not_authenticated',
  429: 'rate_limited',
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function errorOf(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const detail = (body as Partial<Schemas['ErrorBody']> | null)?.error;
  if (detail && typeof detail.code === 'string') {
    return new ApiError(detail.code, response.status, detail.field ?? null);
  }
  return new ApiError(GATEWAY_CODES[response.status] ?? 'unknown', response.status);
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const send = options.fetch ?? ((url, init) => fetch(url, init));
  const sleep = options.sleep ?? wait;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  async function attempt(method: string, path: string, body?: unknown): Promise<Response> {
    let token: string;
    try {
      token = await options.getAccessToken();
    } catch {
      throw new ApiError('not_authenticated');
    }
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    try {
      return await send(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('network');
    }
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!baseUrl) throw new ApiError('not_configured');
    for (let attempts = 1; ; attempts += 1) {
      const response = await attempt(method, path, body);
      if (response.ok) return (await response.json()) as T;
      const error = await errorOf(response);
      if (error.code !== 'waking_up' || attempts >= WAKE_UP_ATTEMPTS) throw error;
      const seconds = Number(response.headers.get('retry-after')) || DEFAULT_RETRY_AFTER_SECONDS;
      await sleep(seconds * 1000);
    }
  }

  /** A path with the query values that are set. */
  function withQuery(path: string, values: Record<string, string | number | undefined>): string {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(values)) {
      if (value !== undefined) query.set(name, String(value));
    }
    const text = query.toString();
    return text ? `${path}?${text}` : path;
  }

  const personaPath = (id: string) => `/v1/personas/${encodeURIComponent(id)}`;
  const personas = async (answer: Promise<Schemas['PersonasOut']>) => (await answer).personas;

  return {
    getCatalog: () => request('GET', '/v1/catalog'),
    getProfile: () => request('GET', '/v1/profile'),
    updateProfile: (changes) => request('PATCH', '/v1/profile', { changes }),
    getOnboarding: () => request('GET', '/v1/onboarding'),
    confirmEssentials: () => request('POST', '/v1/onboarding/essentials/confirm'),
    getPlacement: () => request('GET', '/v1/placement'),
    skipPlacement: () => request('POST', '/v1/placement/skip'),
    decidePlacement: (use) => request('POST', '/v1/placement/decision', { use }),
    proposeStarterPersonas: () => personas(request('POST', '/v1/personas/starter')),
    getPersonas: () => personas(request('GET', '/v1/personas')),
    changePersona: (id, change) => request('PATCH', personaPath(id), change),
    removePersona: (id) => personas(request('DELETE', personaPath(id))),
    createPersona: (persona) => request('POST', '/v1/personas', persona),
    draftPersona: (description) => request('POST', '/v1/personas/draft', { description }),
    getPersonaTemplates: async () =>
      (await request<Schemas['PersonaTemplatesOut']>('GET', '/v1/personas/templates')).templates,
    duplicatePersona: (id) => request('POST', `${personaPath(id)}/duplicate`),
    getVoiceSample: async (voice) =>
      (
        await request<Schemas['VoiceSampleOut']>(
          'GET',
          `/v1/voices/${encodeURIComponent(voice)}/sample`,
        )
      ).url,
    getAccount: () => request('GET', '/v1/account'),
    startPictureUpload: () => request('POST', '/v1/account/picture/upload'),
    confirmPicture: (uploadId) => request('POST', '/v1/account/picture', { uploadId }),
    removePicture: () => request('DELETE', '/v1/account/picture'),
    deleteAccount: async () => void (await request('DELETE', '/v1/account')),
    confirmPartners: () => request('POST', '/v1/onboarding/partners/confirm'),
    completeOnboarding: () => request('POST', '/v1/onboarding/complete'),
    startVoiceCall: (purpose, sdp, details = {}) =>
      request('POST', '/v1/voice/calls', { purpose, sdp, ...details }),
    getHome: (timeZone) => request('GET', withQuery('/v1/home', { tz: timeZone })),
    getProgress: (timeZone) => request('GET', withQuery('/v1/progress', { tz: timeZone })),
    getConversations: (page = {}) =>
      request('GET', withQuery('/v1/conversations', { before: page.before, limit: page.limit })),
    getConversation: (id) => request('GET', `/v1/conversations/${encodeURIComponent(id)}`),
    getConversationReport: (id) =>
      request('GET', `/v1/conversations/${encodeURIComponent(id)}/report`),
    requestConversationReport: (id) =>
      request('POST', `/v1/conversations/${encodeURIComponent(id)}/report`),
    saveCard: (source) => request('POST', '/v1/cards', source),
    getCards: (page = {}) =>
      request('GET', withQuery('/v1/cards', { before: page.before, limit: page.limit })),
    getDueCards: (limit) => request('GET', withQuery('/v1/cards/due', { limit })),
    reviewCard: (id, rating) =>
      request('POST', `/v1/cards/${encodeURIComponent(id)}/review`, { rating }),
    removeCard: (id) => request('DELETE', `/v1/cards/${encodeURIComponent(id)}`),
    getMemories: () => request('GET', '/v1/memories'),
    configureMemories: (settings) => request('PATCH', '/v1/memories', settings),
    getTutorQuestions: () => request('GET', '/v1/tutor/questions'),
    retryCorrection: (conversationId, index, attempt) =>
      request(
        'POST',
        `/v1/conversations/${encodeURIComponent(conversationId)}/report/mistakes/${index}/retries`,
        attempt,
      ),
    getRetries: (conversationId) =>
      request('GET', `/v1/conversations/${encodeURIComponent(conversationId)}/retries`),
    getGrammarMap: () => request('GET', '/v1/grammar'),
    getGrammarTopic: (id) => request('GET', `/v1/grammar/${encodeURIComponent(id)}`),
    askTutor: (question) => request('POST', '/v1/tutor/questions', { question }),
    explainCorrection: (conversationId, index) =>
      request('POST', '/v1/tutor/corrections', { conversationId, index }),
    getRecordings: () => request('GET', '/v1/recordings'),
    configureRecordings: (kept) => request('PATCH', '/v1/recordings', { kept }),
    getVoiceAllowance: () => request('GET', '/v1/voice/allowance'),
    getCosts: (month) => request('GET', withQuery('/v1/owner/costs', { month })),
    changeMemory: (id, change) =>
      request('PATCH', `/v1/memories/${encodeURIComponent(id)}`, change),
    removeMemory: (id) => request('DELETE', `/v1/memories/${encodeURIComponent(id)}`),
  };
}
