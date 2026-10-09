import {
  ApiError,
  type ApiClient,
  type Catalog,
  type Onboarding,
  type Persona,
  type Placement,
  type PlacementResult,
  type PlacementStatus,
  type Profile,
  type ProfileChange,
  type ProfileSource,
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

export const FAKE_NOW = '2026-10-09T12:00:00Z';

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
    async startVoiceCall(purpose, sdp) {
      await record('startVoiceCall', purpose, sdp);
      if (purpose === 'placement') placement = 'in_progress';
      return { callId: 'rtc_fake', sdp: 'v=0 answer', maxSeconds: 480 };
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
