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
/** What a call may say about itself beyond its purpose and offer. */
export interface VoiceCallDetails {
  /** The partner of a practice call. */
  personaId?: string;
  /** Today on the device's calendar ("2026-10-10"), so a persona names the right weekday. */
  localDate?: string;
}
export type Placement = Schemas['PlacementOut'];
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
export type Conversation = Schemas['ConversationOut'];
export type ConversationPage = Schemas['ConversationsOut'];
export type Transcript = Schemas['TranscriptOut'];
export type TranscriptTurn = Schemas['TurnOut'];

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
  /** Past conversations, newest first. `before` is the `next` of the page read before. */
  getConversations(page?: { before?: string; limit?: number }): Promise<ConversationPage>;
  /** One conversation and what was said in it. Fails with `not_found`. */
  getConversation(id: string): Promise<Transcript>;
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
    getConversations: (page = {}) =>
      request('GET', withQuery('/v1/conversations', { before: page.before, limit: page.limit })),
    getConversation: (id) => request('GET', `/v1/conversations/${encodeURIComponent(id)}`),
  };
}
