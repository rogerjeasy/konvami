import type { ApiClient, ConversationReport, SessionReport } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';

/**
 * One conversation's report as a screen sees it. The server writes a report in the background,
 * a minute or so after the conversation ends, so a screen follows it: it asks again every few
 * seconds while the report is being written and stops when there is an answer.
 */
export type ReportView =
  | { phase: 'loading' }
  /** It is being written. */
  | { phase: 'writing' }
  | { phase: 'ready'; report: SessionReport }
  /** Nobody asked for one yet (a conversation from before reports existed). */
  | { phase: 'none' }
  /** The learner said too little in the conversation to report on. */
  | { phase: 'tooShort' }
  /**
   * `failed`: the server could not write it. `timeout`: it never arrived. Otherwise the code of
   * the request that failed (`network`, `not_found`, `consent_required`, `unavailable`,
   * `report_limit`, …).
   */
  | { phase: 'failed'; code: string };

export interface ReportFollower {
  getState(): ReportView;
  subscribe(listener: () => void): () => void;
  /** Reads the report and follows it; called again, it starts over (after a failure). */
  start(): void;
  /** Stops asking. An answer that arrives afterwards is dropped. */
  stop(): void;
  /** Asks the server to write the report (again), then follows it. Never throws. */
  request(): Promise<void>;
}

/** How often (ms) a report that is being written is asked for again. */
export const POLL_MS = 3000;
/**
 * After this many times a report counts as lost: six minutes, just past the point at which the
 * server itself gives one up (services/api: `PENDING_FOR` in domain/reports.py).
 */
export const MAX_POLLS = 120;

interface Timers {
  set: (run: () => void, ms: number) => unknown;
  clear: (timer: never) => void;
}

// Looked up at each call, not once: a test replaces the device's timers after this file loads.
const DEVICE_TIMERS: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (timer) => clearTimeout(timer),
};

export function createReportFollower(
  api: Pick<ApiClient, 'getConversationReport' | 'requestConversationReport'>,
  id: string,
  timers: Timers = DEVICE_TIMERS,
): ReportFollower {
  let state: ReportView = { phase: 'loading' };
  /** Raised whenever following starts over or stops, so an earlier answer is dropped. */
  let run = 0;
  let timer: unknown = null;
  let polls = 0;
  const listeners = new Set<() => void>();

  function setState(next: ReportView) {
    // Asking again while it is being written is not news.
    if (next.phase === 'writing' && state.phase === 'writing') return;
    state = next;
    listeners.forEach((listener) => listener());
  }

  /** Ends whatever was going on; what follows belongs to a new run. */
  function begin(first: ReportView): number {
    run += 1;
    if (timer !== null) timers.clear(timer as never);
    timer = null;
    polls = 0;
    setState(first);
    return run;
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

  function take({ status, report }: ConversationReport, from: number) {
    if (from !== run) return;
    if (status === 'pending') askAgainLater(from);
    else if (status === 'ready' && report) setState({ phase: 'ready', report });
    else if (status === 'none') setState({ phase: 'none' });
    else if (status === 'too_short') setState({ phase: 'tooShort' });
    else setState({ phase: 'failed', code: 'failed' });
  }

  async function read(from: number) {
    try {
      take(await api.getConversationReport(id), from);
    } catch (error) {
      if (from !== run) return;
      // One lost request does not end the wait for a report that is being written.
      if (state.phase === 'writing') askAgainLater(from);
      else setState({ phase: 'failed', code: apiErrorCode(error) });
    }
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    start() {
      void read(begin({ phase: 'loading' }));
    },

    stop() {
      run += 1;
      if (timer !== null) timers.clear(timer as never);
      timer = null;
    },

    async request() {
      const from = begin({ phase: 'writing' });
      try {
        take(await api.requestConversationReport(id), from);
      } catch (error) {
        if (from === run) setState({ phase: 'failed', code: apiErrorCode(error) });
      }
    },
  };
}
