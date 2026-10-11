import { apiErrorCode } from '@/api/messages';

/**
 * A list the server hands out a page at a time, newest first (the library, the deck), with
 * whatever the server says about the list as a whole (`summary`: how many cards are due).
 */
export interface PagedState<Item, Summary = null> {
  phase: 'idle' | 'loading' | 'ready' | 'failed';
  items: Item[];
  /** What the first page said about the whole list; null until it is read. */
  summary: Summary | null;
  /** Older items exist beyond the ones loaded. */
  hasMore: boolean;
  /** The code of the failure of the first page; null otherwise. */
  error: string | null;
  loadingMore: boolean;
  /** The last attempt to read on failed; the list itself is intact. */
  moreFailed: boolean;
}

export interface PagedStore<Item, Summary = null> {
  getState(): PagedState<Item, Summary>;
  subscribe(listener: () => void): () => void;
  /** Loads the first page once. Never throws. */
  load(): Promise<void>;
  /** Loads the first page again from nothing (after a failure). Never throws. */
  reload(): Promise<void>;
  /** Reads the next page, if there is one and none is being read. Never throws. */
  more(): Promise<void>;
  /**
   * Reads the first page again while showing the list (after something was added). Does nothing
   * before the list was ever opened; a failure keeps the list. Never throws.
   */
  refresh(): Promise<void>;
  /** Forgets everything (sign-out). */
  reset(): void;
}

export interface Page<Item, Summary> {
  items: Item[];
  /** Where the next page starts; null on the last one. */
  next: string | null;
  summary: Summary;
}

export function createPagedStore<Item, Summary = null>(
  /** Reads the first page, or the one that starts at `before`. */
  readPage: (before?: string) => Promise<Page<Item, Summary>>,
): PagedStore<Item, Summary> {
  type State = PagedState<Item, Summary>;
  const IDLE: State = {
    phase: 'idle',
    items: [],
    summary: null,
    hasMore: false,
    error: null,
    loadingMore: false,
    moreFailed: false,
  };
  let state = IDLE;
  /** Where the next page starts: the `next` of the last page read. */
  let cursor: string | null = null;
  let request: Promise<void> | null = null;
  /** Raised by `reset`, so an answer that arrives afterwards is dropped. */
  let generation = 0;
  const listeners = new Set<() => void>();

  function setState(next: State) {
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
        const page = await readPage();
        if (from !== generation) return;
        cursor = page.next;
        setState({
          ...IDLE,
          phase: 'ready',
          items: page.items,
          summary: page.summary,
          hasMore: cursor !== null,
        });
      } catch (error) {
        if (from !== generation || quiet) return;
        setState({ ...IDLE, phase: 'failed', error: apiErrorCode(error) });
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
          const page = await readPage(before);
          if (from !== generation) return;
          cursor = page.next;
          setState({
            ...state,
            items: [...state.items, ...page.items],
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
