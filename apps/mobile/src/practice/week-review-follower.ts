import type { ApiClient, WeekReview } from '@konvami/api-client';
import {
  createWrittenFollower,
  DEVICE_TIMERS,
  type Timers,
  type WrittenFollower,
  type WrittenView,
} from './written-follower';

/** The words of last week's check-in, as Progress shows them. */
export type WeekReviewView = WrittenView<string>;
export type WeekReviewFollower = WrittenFollower<WeekReview, string>;

/** How often (ms) words being written are asked for again. */
export const POLL_MS = 4000;
/**
 * After this many times they count as lost: four minutes, before the server itself gives them
 * up (services/api: `STALE_AFTER` in domain/week_review.py) and they can be asked for again.
 */
export const MAX_POLLS = 60;

/**
 * The server's worker writes the check-in a few seconds after it is first asked for, so
 * Progress asks for it once and follows it until it is there.
 */
export function createWeekReviewFollower(
  api: Pick<ApiClient, 'requestWeekReview' | 'getWeekReview'>,
  week: string,
  timeZone: string | undefined,
  timers: Timers = DEVICE_TIMERS,
): WeekReviewFollower {
  return createWrittenFollower<WeekReview, string>(
    {
      read: () => api.getWeekReview(week, timeZone),
      request: () => api.requestWeekReview(week, timeZone),
      view: (review) =>
        review.status === 'ready' && review.text
          ? { phase: 'ready', value: review.text }
          : review.status === 'pending'
            ? { phase: 'writing' }
            : review.status === 'failed'
              ? { phase: 'failed', code: 'failed' }
              : { phase: 'idle' },
    },
    { pollMs: POLL_MS, maxPolls: MAX_POLLS },
    timers,
  );
}
