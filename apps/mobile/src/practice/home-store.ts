import { ApiError, type ApiClient, type Home } from '@konvami/api-client';

/**
 * What the Today and Talk screens show, read from the server in one answer. Screens read the
 * store; after a conversation, or when the app has been away for a while, it is read again
 * while the screen keeps showing what it had.
 */
export type HomeState =
  | { phase: 'idle' | 'loading'; data: null; error: null; refreshing: false }
  | { phase: 'ready'; data: Home; error: null; refreshing: boolean }
  /** `error` is the code of the failure (`network`, `waking_up`, …). */
  | { phase: 'failed'; data: null; error: string; refreshing: false };

export interface HomeStore {
  getState(): HomeState;
  subscribe(listener: () => void): () => void;
  /** Loads once; later calls do nothing, and calls made while loading share that request. Never throws. */
  load(): Promise<void>;
  /** Loads again from nothing, whatever the current state (after a failure). Never throws. */
  reload(): Promise<void>;
  /**
   * Reads home again while showing what is there. A failure keeps what is there: the screen is
   * not worse off than before. Never throws.
   */
  refresh(): Promise<void>;
  /** `refresh`, but only when what is shown is older than `STALE_AFTER_MS`. */
  revisit(): Promise<void>;
  /** Forgets everything (sign-out): the next account must not see this one's practice. */
  reset(): void;
}

/** Coming back to the screen after this long (ms) reads home again: a new day may have begun. */
export const STALE_AFTER_MS = 60_000;

const IDLE: HomeState = { phase: 'idle', data: null, error: null, refreshing: false };

export function createHomeStore(
  api: Pick<ApiClient, 'getHome'>,
  device: {
    /** The device's time zone, so days follow the learner's calendar. */
    timeZone: () => string | undefined;
    /** Milliseconds since the epoch. */
    now: () => number;
  },
): HomeStore {
  let state: HomeState = IDLE;
  let request: Promise<void> | null = null;
  let loadedAt = 0;
  /** Raised by `reset`, so an answer that arrives afterwards is dropped. */
  let generation = 0;
  const listeners = new Set<() => void>();

  function setState(next: HomeState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  /** Reads home once; `quiet` keeps the current data on screen and survives a failure. */
  function read(quiet: boolean): Promise<void> {
    const from = generation;
    if (quiet && state.phase === 'ready') setState({ ...state, refreshing: true });
    else setState({ phase: 'loading', data: null, error: null, refreshing: false });
    // An async function, so a client that throws instead of rejecting is a failed load as well,
    // and never an error in the screen that asked.
    const current = (async () => {
      try {
        const data = await api.getHome(device.timeZone());
        if (from !== generation) return;
        loadedAt = device.now();
        setState({ phase: 'ready', data, error: null, refreshing: false });
      } catch (error) {
        if (from !== generation) return;
        if (state.phase === 'ready') {
          setState({ ...state, refreshing: false });
          return;
        }
        const code = error instanceof ApiError ? error.code : 'unknown';
        setState({ phase: 'failed', data: null, error: code, refreshing: false });
      }
    })().finally(() => {
      if (request === current) request = null;
    });
    request = current;
    return current;
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    load() {
      if (request) return request;
      return state.phase === 'ready' ? Promise.resolve() : read(false);
    },

    reload: () => request ?? read(false),

    refresh: () => request ?? read(state.phase === 'ready'),

    revisit() {
      if (state.phase !== 'ready' || device.now() - loadedAt < STALE_AFTER_MS) {
        return Promise.resolve();
      }
      return request ?? read(true);
    },

    reset() {
      generation += 1;
      request = null;
      loadedAt = 0;
      setState(IDLE);
    },
  };
}
