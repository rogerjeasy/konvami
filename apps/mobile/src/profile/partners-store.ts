import {
  ApiError,
  type ApiClient,
  type Persona,
  type PersonaChange,
  type PersonaInput,
} from '@konvami/api-client';

/**
 * The learner's partners as Persona Studio and the partner list show them, with everything
 * that can be changed about them. Every change goes to the server first, so the store never
 * holds a partner that was not saved.
 */
export type PartnersState =
  | { phase: 'idle' | 'loading'; partners: null; error: null }
  | { phase: 'ready'; partners: Persona[]; error: null }
  /** `error` is the code of the failure (`network`, `waking_up`, …). */
  | { phase: 'failed'; partners: null; error: string };

export interface PartnersStore {
  getState(): PartnersState;
  subscribe(listener: () => void): () => void;
  /** Loads once; calls made while loading share that request. Never throws. */
  load(): Promise<void>;
  /** Loads again, whatever the current state (after a failure). Never throws. */
  reload(): Promise<void>;
  /** Adds a partner. Rejects with an `ApiError` (`invalid_value`, `too_many`, …). */
  create(partner: PersonaInput): Promise<Persona>;
  change(id: string, change: PersonaChange): Promise<Persona>;
  duplicate(id: string): Promise<Persona>;
  remove(id: string): Promise<void>;
  /** Forgets everything (sign-out). */
  reset(): void;
}

const IDLE: PartnersState = { phase: 'idle', partners: null, error: null };

export function createPartnersStore(
  api: Pick<
    ApiClient,
    'getPersonas' | 'createPersona' | 'changePersona' | 'duplicatePersona' | 'removePersona'
  >,
  /** Called after every saved change, so Today and Talk can read their partners again. */
  onChanged: () => void,
): PartnersStore {
  let state: PartnersState = IDLE;
  let loading: Promise<void> | null = null;
  /** Raised by `reset`, so an answer that arrives afterwards is dropped. */
  let generation = 0;
  const listeners = new Set<() => void>();

  function setState(next: PartnersState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function fetchAll(): Promise<void> {
    const from = generation;
    setState({ phase: 'loading', partners: null, error: null });
    const request = api
      .getPersonas()
      .then((partners) => {
        if (from === generation) setState({ phase: 'ready', partners, error: null });
      })
      .catch((error: unknown) => {
        if (from !== generation) return;
        const code = error instanceof ApiError ? error.code : 'unknown';
        setState({ phase: 'failed', partners: null, error: code });
      })
      .finally(() => {
        if (loading === request) loading = null;
      });
    loading = request;
    return request;
  }

  /** Applies a saved change to the list, when there is a list and it is still this account's. */
  function saved(from: number, apply: (partners: Persona[]) => Persona[]) {
    if (from !== generation) return;
    if (state.phase === 'ready') {
      setState({ phase: 'ready', partners: apply(state.partners), error: null });
    }
    onChanged();
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

    async create(partner) {
      const from = generation;
      const created = await api.createPersona(partner);
      saved(from, (partners) => [...partners, created]);
      return created;
    },

    async change(id, change) {
      const from = generation;
      const changed = await api.changePersona(id, change);
      saved(from, (partners) => partners.map((partner) => (partner.id === id ? changed : partner)));
      return changed;
    },

    async duplicate(id) {
      const from = generation;
      const copy = await api.duplicatePersona(id);
      saved(from, (partners) => [...partners, copy]);
      return copy;
    },

    async remove(id) {
      const from = generation;
      const left = await api.removePersona(id);
      saved(from, () => left);
    },

    reset() {
      generation += 1;
      loading = null;
      setState(IDLE);
    },
  };
}
