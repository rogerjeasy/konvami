import {
  ApiError,
  type Activity,
  type ApiClient,
  type Catalog,
  type Conversation,
  type Home,
  type HomePartner,
  type Onboarding,
  type Persona,
  type Placement,
  type PlacementResult,
  type PlacementStatus,
  type Profile,
  type ProfileChange,
  type ProfileSource,
  type TranscriptTurn,
} from '@konvami/api-client';

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
    },
    { code: 'en', available: false, exams: [] },
    { code: 'fr', available: false, exams: [] },
    { code: 'it', available: false, exams: [] },
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
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
/** As on the server (services/api: domain/conversations.py and domain/home.py). */
const PAGE_DEFAULT = 20;
const RECENT_CONVERSATIONS = 3;

/** A placement result one level above the typical learner's own estimate (A2). */
export const FAKE_RESULT: PlacementResult = {
  levels: { speaking: 'B1', listening: 'B1', grammar: 'A2', vocabulary: 'B1', pronunciation: 'B2' },
  overall: 'B1',
  weakAreas: ['Word order after “weil”: “weil sie ist ruhig”', 'Dative after “mit”'],
  measuredAt: FAKE_NOW,
};

/** The partners the server proposes, as the German pack's built-in ones (no tagline). */
export const FAKE_PERSONAS: Persona[] = [
  {
    id: '7b1c2f0e-6c1b-4a8e-9a55-0d2f6a1c9e11',
    role: 'buddy',
    name: 'Lena',
    age: 27,
    origin: 'Berlin',
    tagline: null,
    look: {
      skin: 'sand',
      hair: 'bob',
      hairColor: 'chestnut',
      top: 'teal',
      backdrop: 'mist',
      glasses: false,
      beard: false,
    },
  },
  {
    id: '1d0f8a52-3c7e-4f0b-8a41-5b9e2c7d4a22',
    role: 'teacher',
    name: 'Jonas',
    age: 34,
    origin: 'Zürich',
    tagline: 'Clear explanations and plenty of patience.',
    look: {
      skin: 'honey',
      hair: 'short',
      hairColor: 'espresso',
      top: 'graphite',
      backdrop: 'sand',
      glasses: true,
      beard: true,
    },
  },
  {
    id: 'c4e9b7a1-2f6d-4d3c-9b18-6a0f1e8d5c33',
    role: 'exam_coach',
    name: 'Frau Weber',
    age: 52,
    origin: 'Wien',
    tagline: null,
    look: {
      skin: 'porcelain',
      hair: 'bun',
      hairColor: 'silver',
      top: 'stone',
      backdrop: 'slate',
      glasses: true,
      beard: false,
    },
  },
];

export interface FakeApi extends ApiClient {
  failNext(method: keyof ApiClient, code: string, field?: string): void;
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
   * `minutes` later. With `ended: false` it is a call still running or being saved.
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
    },
  ): Conversation;
  /** Ends a call recorded with `ended: false`. */
  finish(id: string, options?: { minutes?: number; learnerSays?: string[] }): void;
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

  function turnsOf(learnerSays: string[]): TranscriptTurn[] {
    return [
      { speaker: 'persona', text: 'Hallo! Wie geht’s dir heute?' },
      ...learnerSays.map((text): TranscriptTurn => ({ speaker: 'learner', text })),
    ];
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
      focus: result?.weakAreas ?? [],
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
    };
  }

  return {
    calls,
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
      };
      practice.push({ conversation, turns: ended ? turnsOf(learnerSays) : [] });
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
    async startVoiceCall(purpose, sdp, { personaId } = {}) {
      await record('startVoiceCall', purpose, sdp, personaId);
      if (purpose === 'placement') placement = 'in_progress';
      if (purpose === 'practice' && !personas?.some(({ id }) => id === personaId)) {
        throw new ApiError('not_found', 404);
      }
      return {
        callId: 'rtc_fake',
        sdp: 'v=0 answer',
        maxSeconds: purpose === 'practice' ? 600 : 480,
      };
    },
    async getHome(timeZone) {
      await record('getHome', timeZone);
      return home();
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
      const changed = { ...persona(id), ...change };
      if (!changed.name.trim()) throw new ApiError('invalid_value', 422, 'name');
      personas = (personas ?? []).map((candidate) => (candidate.id === id ? changed : candidate));
      return changed;
    },
    async removePersona(id) {
      await record('removePersona', id);
      persona(id);
      personas = (personas ?? []).filter((candidate) => candidate.id !== id);
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
