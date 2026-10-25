import { apiErrorCode } from '@/api/messages';

/**
 * Something the server's worker writes a few seconds after it is asked for (last week's
 * check-in, an exam simulation's score), as a screen follows it: it asks again every few
 * seconds while it is being written and stops when there is an answer.
 */
export type WrittenView<Value> =
  | { phase: 'idle' }
  | { phase: 'writing' }
  | { phase: 'ready'; value: Value }
  /**
   * `failed`: the worker could not write it. `timeout`: it never arrived. Otherwise a code of
   * what the worker or a request said (`too_short`, `network`, `consent_required`, …).
   */
  | { phase: 'failed'; code: string };

export interface WrittenFollower<Answer, Value> {
  getState(): WrittenView<Value>;
  subscribe(listener: () => void): () => void;
  /** Takes an answer read elsewhere: asks for it, follows it or shows it, as it needs. */
  start(answer: Answer): void;
  /** Reads it and follows it. Never throws. */
  follow(): Promise<void>;
  /** Asks for it (again, after a failure), then follows it. Never throws. */
  request(): Promise<void>;
  /** Stops asking. An answer that arrives afterwards is dropped. */
  stop(): void;
}

export interface Written<Answer, Value> {
  read: () => Promise<Answer>;
  request: () => Promise<Answer>;
  /** What an answer says: nobody asked for it yet (`idle`), it is being written, or not. */
  view: (answer: Answer) => WrittenView<Value>;
}

export interface Timers {
  set: (run: () => void, ms: number) => unknown;
  clear: (timer: never) => void;
}

// Looked up at each call, not once: a test replaces the device's timers after this file loads.
export const DEVICE_TIMERS: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (timer) => clearTimeout(timer),
};

export function createWrittenFollower<Answer, Value>(
  written: Written<Answer, Value>,
  /** How often (ms) it is asked for again, and after how many times it counts as lost. */
  { pollMs, maxPolls }: { pollMs: number; maxPolls: number },
  timers: Timers = DEVICE_TIMERS,
): WrittenFollower<Answer, Value> {
  let state: WrittenView<Value> = { phase: 'idle' };
  /** Raised whenever following starts over or stops, so an earlier answer is dropped. */
  let run = 0;
  let timer: unknown = null;
  let polls = 0;
  const listeners = new Set<() => void>();

  function setState(next: WrittenView<Value>) {
    // Asking again while it is being written is not news.
    if (next.phase === 'writing' && state.phase === 'writing') return;
    state = next;
    listeners.forEach((listener) => listener());
  }

  function begin(): number {
    run += 1;
    if (timer !== null) timers.clear(timer as never);
    timer = null;
    polls = 0;
    return run;
  }

  function take(answer: Answer, from: number) {
    if (from !== run) return;
    const view = written.view(answer);
    if (view.phase === 'writing') askAgainLater(from);
    else setState(view);
  }

  function askAgainLater(from: number) {
    if (polls >= maxPolls) {
      setState({ phase: 'failed', code: 'timeout' });
      return;
    }
    polls += 1;
    setState({ phase: 'writing' });
    timer = timers.set(() => {
      timer = null;
      void read(from);
    }, pollMs);
  }

  async function read(from: number) {
    try {
      take(await written.read(), from);
    } catch (error) {
      if (from !== run) return;
      // One lost request does not end the wait for something being written.
      if (state.phase === 'writing') askAgainLater(from);
      else setState({ phase: 'failed', code: apiErrorCode(error) });
    }
  }

  async function request() {
    const from = begin();
    setState({ phase: 'writing' });
    try {
      take(await written.request(), from);
    } catch (error) {
      if (from === run) setState({ phase: 'failed', code: apiErrorCode(error) });
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start(answer) {
      if (written.view(answer).phase === 'idle') {
        void request();
        return;
      }
      take(answer, begin());
    },
    follow: () => read(begin()),
    request,
    stop() {
      begin();
    },
  };
}
