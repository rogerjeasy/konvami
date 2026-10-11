import { apiErrorCode } from '@/api/messages';

/**
 * One answer from the server that a screen shows whole (Today, Progress). Screens read the
 * store; when the app has been away for a while, or something changed, it is read again while
 * the screen keeps showing what it had.
 */
export type ResourceState<Data> =
  | { phase: 'idle' | 'loading'; data: null; error: null; refreshing: false }
  | { phase: 'ready'; data: Data; error: null; refreshing: boolean }
  /** `error` is the code of the failure (`network`, `waking_up`, …). */
  | { phase: 'failed'; data: null; error: string; refreshing: false };

export interface ResourceStore<Data> {
  getState(): ResourceState<Data>;
  subscribe(listener: () => void): () => void;
  /** Loads once; later calls do nothing, and calls made while loading share that request. Never throws. */
  load(): Promise<void>;
  /** Loads again from nothing, whatever the current state (after a failure). Never throws. */
  reload(): Promise<void>;
  /**
   * Reads again while showing what is there. A failure keeps what is there: the screen is not
   * worse off than before. Never throws.
   */
  refresh(): Promise<void>;
  /** `refresh`, but only when what is shown is older than `STALE_AFTER_MS`. */
  revisit(): Promise<void>;
  /**
   * Makes a change on the server and shows its result without reading everything again:
   * `apply` turns what is shown and the server's answer into what to show. The answer is
   * dropped when the store was reset meanwhile, or shows nothing. Rejects with what `request`
   * rejects with; what is shown then stays as it is.
   */
  mutate<Answer>(
    request: () => Promise<Answer>,
    apply: (shown: Data, answer: Answer) => Data,
  ): Promise<Answer>;
  /** Forgets everything (sign-out): the next account must not see this one's practice. */
  reset(): void;
}

/** Coming back to the screen after this long (ms) reads again: a new day may have begun. */
export const STALE_AFTER_MS = 60_000;

export function createResourceStore<Data>(
  /** Reads the answer from the server. */
  fetch: () => Promise<Data>,
  /** Milliseconds since the epoch. */
  now: () => number,
): ResourceStore<Data> {
  type State = ResourceState<Data>;
  const IDLE: State = { phase: 'idle', data: null, error: null, refreshing: false };
  let state: State = IDLE;
  let request: Promise<void> | null = null;
  let loadedAt = 0;
  /** Raised by `reset`, so an answer that arrives afterwards is dropped. */
  let generation = 0;
  const listeners = new Set<() => void>();

  function setState(next: State) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  /** Reads once; `quiet` keeps the current data on screen and survives a failure. */
  function read(quiet: boolean): Promise<void> {
    const from = generation;
    if (quiet && state.phase === 'ready') setState({ ...state, refreshing: true });
    else setState({ phase: 'loading', data: null, error: null, refreshing: false });
    const current = (async () => {
      try {
        const data = await fetch();
        if (from !== generation) return;
        loadedAt = now();
        setState({ phase: 'ready', data, error: null, refreshing: false });
      } catch (error) {
        if (from !== generation) return;
        if (state.phase === 'ready') {
          setState({ ...state, refreshing: false });
          return;
        }
        setState({ phase: 'failed', data: null, error: apiErrorCode(error), refreshing: false });
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
      if (state.phase !== 'ready' || now() - loadedAt < STALE_AFTER_MS) {
        return Promise.resolve();
      }
      return request ?? read(true);
    },

    async mutate(send, apply) {
      const from = generation;
      const answer = await send();
      if (from === generation && state.phase === 'ready') {
        setState({ ...state, data: apply(state.data, answer) });
      }
      return answer;
    },

    reset() {
      generation += 1;
      request = null;
      loadedAt = 0;
      setState(IDLE);
    },
  };
}
