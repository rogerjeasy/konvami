import {
  ApiError,
  type ApiClient,
  type Catalog,
  type Onboarding,
  type Persona,
  type PersonaChange,
  type Placement,
  type PlacementChoice,
  type Profile,
  type ProfileChange,
} from '@konvami/api-client';
import { essentialsOf, type Essentials } from './essentials';

/**
 * What the onboarding screens share: the catalog of choices, the learner's profile and the stage
 * they have reached. One store for the whole app, like the session store: screens read it, and
 * every change goes to the server first, so the store never holds an answer that was not saved.
 */
export interface OnboardingData {
  catalog: Catalog;
  profile: Profile;
  /** The typed view of the profile's essential answers. */
  essentials: Essentials;
  status: Onboarding;
  /** The placement test as last read with `checkPlacement`; null before that. */
  placement: Placement | null;
  /** The learner's partners as last read; null before `proposePartners` or `loadPartners`. */
  partners: Persona[] | null;
}

export type OnboardingState =
  | { phase: 'idle' | 'loading'; data: null; error: null }
  | { phase: 'ready'; data: OnboardingData; error: null }
  /** `error` is the code of the failure (`network`, `waking_up`, …). */
  | { phase: 'failed'; data: null; error: string };

export interface OnboardingStore {
  getState(): OnboardingState;
  subscribe(listener: () => void): () => void;
  /** Loads once; later calls do nothing, and calls made while loading share that request. Never throws. */
  load(): Promise<void>;
  /** Loads again, whatever the current state. Never throws. */
  reload(): Promise<void>;
  /** Saves answers. Rejects with an `ApiError` and leaves the store as it was when refused. */
  save(changes: ProfileChange[]): Promise<void>;
  /**
   * Re-reads the profile and the stage while staying `ready`, for changes the server made by
   * itself (a placement test being assessed). Rejects with an `ApiError`, keeping what it has.
   */
  refresh(): Promise<void>;
  confirmEssentials(): Promise<void>;
  skipPlacement(): Promise<void>;
  /**
   * Reads where the placement test stands and, once assessed, its result. When the test has
   * moved on since the stage was read, the stage and the profile are read again too.
   */
  checkPlacement(): Promise<Placement>;
  /** Starts at the measured level or at the learner's own estimate. */
  decidePlacement(use: PlacementChoice): Promise<void>;
  /** The starter partners for this learner: written on the first call, the same ones after. */
  proposePartners(): Promise<void>;
  /** The partners the learner has, without proposing any. */
  loadPartners(): Promise<void>;
  changePartner(id: string, change: PersonaChange): Promise<void>;
  removePartner(id: string): Promise<void>;
  confirmPartners(): Promise<void>;
  /** The learner enters the app: onboarding is done. */
  complete(): Promise<void>;
  /** Forgets everything (sign-out): the next account must not see this one's answers. */
  reset(): void;
}

const IDLE: OnboardingState = { phase: 'idle', data: null, error: null };

export function createOnboardingStore(api: ApiClient): OnboardingStore {
  let state: OnboardingState = IDLE;
  let loading: Promise<void> | null = null;
  /** Raised by `reset`, so an answer that arrives afterwards is dropped. */
  let generation = 0;
  const listeners = new Set<() => void>();

  function setState(next: OnboardingState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function update(changes: Partial<Omit<OnboardingData, 'catalog' | 'essentials'>>, from: number) {
    if (from !== generation || state.phase !== 'ready') return;
    const data = { ...state.data, ...changes };
    setState({
      phase: 'ready',
      data: { ...data, essentials: essentialsOf(data.profile) },
      error: null,
    });
  }

  function fetchAll(): Promise<void> {
    const from = generation;
    setState({ phase: 'loading', data: null, error: null });
    const request = Promise.all([api.getCatalog(), api.getProfile(), api.getOnboarding()])
      .then(([catalog, profile, status]) => {
        if (from !== generation) return;
        const essentials = essentialsOf(profile);
        const data = { catalog, profile, essentials, status, placement: null, partners: null };
        setState({ phase: 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (from !== generation) return;
        const code = error instanceof ApiError ? error.code : 'unknown';
        setState({ phase: 'failed', data: null, error: code });
      })
      .finally(() => {
        if (loading === request) loading = null;
      });
    loading = request;
    return request;
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    load() {
      if (loading) return loading;
      return state.phase === 'ready' ? Promise.resolve() : fetchAll();
    },

    reload: () => loading ?? fetchAll(),

    async save(changes) {
      const from = generation;
      const profile = await api.updateProfile(changes);
      update({ profile, status: await api.getOnboarding() }, from);
    },

    async confirmEssentials() {
      const from = generation;
      update({ status: await api.confirmEssentials() }, from);
    },

    async refresh() {
      const from = generation;
      const [profile, status] = await Promise.all([api.getProfile(), api.getOnboarding()]);
      update({ profile, status }, from);
    },

    async skipPlacement() {
      const from = generation;
      const status = await api.skipPlacement();
      // Postponing the test stores the starting level, so the profile has changed too.
      update({ status, profile: await api.getProfile() }, from);
    },

    async checkPlacement() {
      const from = generation;
      const placement = await api.getPlacement();
      const moved = state.phase === 'ready' && state.data.status.placement !== placement.status;
      if (moved) {
        const [profile, status] = await Promise.all([api.getProfile(), api.getOnboarding()]);
        update({ placement, profile, status }, from);
      } else {
        update({ placement }, from);
      }
      return placement;
    },

    async decidePlacement(use) {
      const from = generation;
      const status = await api.decidePlacement(use);
      // The choice stores the starting level, so the profile has changed too.
      update({ status, profile: await api.getProfile() }, from);
    },

    async proposePartners() {
      const from = generation;
      update({ partners: await api.proposeStarterPersonas() }, from);
    },

    async loadPartners() {
      const from = generation;
      update({ partners: await api.getPersonas() }, from);
    },

    async changePartner(id, change) {
      const from = generation;
      const changed = await api.changePersona(id, change);
      if (state.phase !== 'ready' || !state.data.partners) return;
      const partners = state.data.partners.map((partner) =>
        partner.id === id ? changed : partner,
      );
      update({ partners }, from);
    },

    async removePartner(id) {
      const from = generation;
      update({ partners: await api.removePersona(id) }, from);
    },

    async confirmPartners() {
      const from = generation;
      update({ status: await api.confirmPartners() }, from);
    },

    async complete() {
      const from = generation;
      update({ status: await api.completeOnboarding() }, from);
    },

    reset() {
      generation += 1;
      loading = null;
      setState(IDLE);
    },
  };
}
