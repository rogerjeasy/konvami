import { ApiError, type ApiClient, type Conversation } from '@konvami/api-client';

/**
 * The learner's past conversations, newest first, read a page at a time as the list is scrolled.
 */
export interface LibraryState {
  phase: 'idle' | 'loading' | 'ready' | 'failed';
  conversations: Conversation[];
  /** Older conversations exist beyond the ones loaded. */
  hasMore: boolean;
  /** The code of the failure of the first page; null otherwise. */
  error: string | null;
  loadingMore: boolean;
  /** The last attempt to read on failed; the list itself is intact. */
  moreFailed: boolean;
}

export interface LibraryStore {
  getState(): LibraryState;
  subscribe(listener: () => void): () => void;
  /** Loads the first page once. Never throws. */
  load(): Promise<void>;
  /** Loads the first page again from nothing (after a failure). Never throws. */
  reload(): Promise<void>;
  /** Reads the next page, if there is one and none is being read. Never throws. */
  more(): Promise<void>;
  /**
   * Reads the first page again while showing the list (after a new conversation). Does nothing
   * before the list was ever opened; a failure keeps the list. Never throws.
   */
  refresh(): Promise<void>;
  /** Forgets everything (sign-out). */
  reset(): void;
}

/** Conversations per request: a few screens' worth. */
export const PAGE_SIZE = 20;

const IDLE: LibraryState = {
  phase: 'idle',
  conversations: [],
  hasMore: false,
  error: null,
  loadingMore: false,
  moreFailed: false,
};

export function createLibraryStore(api: Pick<ApiClient, 'getConversations'>): LibraryStore {
  let state: LibraryState = IDLE;
  /** Where the next page starts: the `next` of the last page read. */
  let cursor: string | null = null;
  let request: Promise<void> | null = null;
  /** Raised by `reset`, so an answer that arrives afterwards is dropped. */
  let generation = 0;
  const listeners = new Set<() => void>();

  function setState(next: LibraryState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  /** Runs one request at a time; `request` is that request until it settles. */
  function run(task: (from: number) => Promise<void>): Promise<void> {
    const current = task(generation).finally(() => {
      if (request === current) request = null;
    });
    request = current;
    return current;
  }

  /** Reads the first page; `quiet` keeps the list on screen and survives a failure. */
  function first(quiet: boolean): Promise<void> {
    if (!quiet) setState({ ...IDLE, phase: 'loading' });
    return run(async (from) => {
      try {
        const page = await api.getConversations({ limit: PAGE_SIZE });
        if (from !== generation) return;
        cursor = page.next;
        setState({
          ...IDLE,
          phase: 'ready',
          conversations: page.conversations,
          hasMore: cursor !== null,
        });
      } catch (error) {
        if (from !== generation || quiet) return;
        setState({
          ...IDLE,
          phase: 'failed',
          error: error instanceof ApiError ? error.code : 'unknown',
        });
      }
    });
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    load() {
      if (request) return request;
      return state.phase === 'ready' ? Promise.resolve() : first(false);
    },

    reload: () => request ?? first(false),

    more() {
      if (request) return request;
      const before = cursor;
      if (state.phase !== 'ready' || before === null) return Promise.resolve();
      setState({ ...state, loadingMore: true, moreFailed: false });
      return run(async (from) => {
        try {
          const page = await api.getConversations({ before, limit: PAGE_SIZE });
          if (from !== generation) return;
          cursor = page.next;
          setState({
            ...state,
            conversations: [...state.conversations, ...page.conversations],
            hasMore: cursor !== null,
            loadingMore: false,
          });
        } catch {
          if (from !== generation) return;
          setState({ ...state, loadingMore: false, moreFailed: true });
        }
      });
    },

    refresh() {
      if (request) return request;
      return state.phase === 'ready' ? first(true) : Promise.resolve();
    },

    reset() {
      generation += 1;
      request = null;
      cursor = null;
      setState(IDLE);
    },
  };
}
