import type { ApiClient, WeekReview } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';

/**
 * The words of last week's check-in, as Progress shows them. The server's worker writes them a
 * few seconds after they are first asked for, so the screen asks for them once and follows them
 * until they are there.
 */
export type WeekReviewView =
  | { phase: 'idle' }
  | { phase: 'writing' }
  | { phase: 'ready'; text: string }
  /**
   * `failed`: the worker could not write them. `timeout`: they never arrived. Otherwise the code
   * of the request that failed (`network`, `consent_required`, `unavailable`, …).
   */
  | { phase: 'failed'; code: string };

export interface WeekReviewFollower {
  getState(): WeekReviewView;
  subscribe(listener: () => void): () => void;
  /** Takes the check-in as Progress read it: asks for its words or follows them, as needed. */
  start(review: WeekReview): void;
  /** Asks for the words (again, after a failure), then follows them. Never throws. */
  request(): Promise<void>;
  /** Stops asking. An answer that arrives afterwards is dropped. */
  stop(): void;
}

/** How often (ms) words being written are asked for again. */
export const POLL_MS = 4000;
/**
 * After this many times they count as lost: four minutes, before the server itself gives them
 * up (services/api: `STALE_AFTER` in domain/week_review.py) and they can be asked for again.
 */
export const MAX_POLLS = 60;

interface Timers {
  set: (run: () => void, ms: number) => unknown;
  clear: (timer: never) => void;
}

// Looked up at each call, not once: a test replaces the device's timers after this file loads.
const DEVICE_TIMERS: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (timer) => clearTimeout(timer),
};

export function createWeekReviewFollower(
  api: Pick<ApiClient, 'requestWeekReview' | 'getWeekReview'>,
  week: string,
  timeZone: string | undefined,
  timers: Timers = DEVICE_TIMERS,
): WeekReviewFollower {
  let state: WeekReviewView = { phase: 'idle' };
  /** Raised whenever following starts over or stops, so an earlier answer is dropped. */
  let run = 0;
  let timer: unknown = null;
  let polls = 0;
  const listeners = new Set<() => void>();

  function setState(next: WeekReviewView) {
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

  function take(review: WeekReview, from: number) {
    if (from !== run) return;
    if (review.status === 'ready' && review.text) setState({ phase: 'ready', text: review.text });
    else if (review.status === 'pending') askAgainLater(from);
    else if (review.status === 'failed') setState({ phase: 'failed', code: 'failed' });
    else setState({ phase: 'idle' });
  }

  function askAgainLater(from: number) {
    if (polls >= MAX_POLLS) {
      setState({ phase: 'failed', code: 'timeout' });
      return;
    }
    polls += 1;
    setState({ phase: 'writing' });
    timer = timers.set(() => {
      timer = null;
      void read(from);
    }, POLL_MS);
  }

  async function read(from: number) {
    try {
      take(await api.getWeekReview(week, timeZone), from);
    } catch (error) {
      if (from !== run) return;
      // One lost request does not end the wait for words being written.
      if (state.phase === 'writing') askAgainLater(from);
      else setState({ phase: 'failed', code: apiErrorCode(error) });
    }
  }

  async function request() {
    const from = begin();
    setState({ phase: 'writing' });
    try {
      take(await api.requestWeekReview(week, timeZone), from);
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
    start(review) {
      if (review.status === 'none') {
        void request();
        return;
      }
      take(review, begin());
    },
    request,
    stop() {
      begin();
    },
  };
}
