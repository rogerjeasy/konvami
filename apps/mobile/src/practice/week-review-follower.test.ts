import { createFakeApi, FAKE_WEEK_REVIEW, FAKE_WEEK_TEXT } from '@/test/fake-api';
import { createWeekReviewFollower, MAX_POLLS, POLL_MS } from './week-review-follower';

const WEEK = FAKE_WEEK_REVIEW.numbers.week;

function manualTimers() {
  const pending: { run: () => void; ms: number }[] = [];
  return {
    pending,
    timers: {
      set: (run: () => void, ms: number) => pending.push({ run, ms }),
      clear: () => void pending.splice(0),
    },
    async tick() {
      const next = pending.shift();
      next?.run();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('following last week’s check-in', () => {
  it('asks for one nobody asked for yet, then follows it until its words are there', async () => {
    const api = createFakeApi();
    api.practisedLastWeek();
    const clock = manualTimers();
    const follower = createWeekReviewFollower(api, WEEK, 'Europe/Zurich', clock.timers);

    follower.start(FAKE_WEEK_REVIEW);
    await settled();

    expect(follower.getState()).toEqual({ phase: 'writing' });
    expect(clock.pending[0]?.ms).toBe(POLL_MS);
    await clock.tick();
    await settled();
    await clock.tick();
    await settled();

    expect(follower.getState()).toEqual({ phase: 'ready', text: FAKE_WEEK_TEXT });
    expect(api.calls.filter(([method]) => method === 'requestWeekReview')).toHaveLength(1);
  });

  it('shows one that is written at once, and asks nothing', () => {
    const api = createFakeApi();
    const follower = createWeekReviewFollower(api, WEEK, undefined, manualTimers().timers);

    follower.start({ ...FAKE_WEEK_REVIEW, status: 'ready', text: 'Gut gemacht!' });

    expect(follower.getState()).toEqual({ phase: 'ready', text: 'Gut gemacht!' });
    expect(api.calls).toEqual([]);
  });

  it('says so when the words could not be written, and can ask again', async () => {
    const api = createFakeApi();
    api.practisedLastWeek({}, 'failed');
    const clock = manualTimers();
    const follower = createWeekReviewFollower(api, WEEK, undefined, clock.timers);

    follower.start(FAKE_WEEK_REVIEW);
    await settled();
    await clock.tick();
    await settled();
    await clock.tick();
    await settled();
    expect(follower.getState()).toEqual({ phase: 'failed', code: 'failed' });

    api.practisedLastWeek({ status: 'failed' }, 'ready');
    await follower.request();
    expect(follower.getState()).toEqual({ phase: 'writing' });
  });

  it('gives up waiting after a while', async () => {
    const api = createFakeApi();
    api.practisedLastWeek({}, 'pending');
    const clock = manualTimers();
    const follower = createWeekReviewFollower(api, WEEK, undefined, clock.timers);

    follower.start(FAKE_WEEK_REVIEW);
    await settled();
    for (let i = 0; i <= MAX_POLLS; i += 1) {
      await clock.tick();
      await settled();
    }

    expect(follower.getState()).toEqual({ phase: 'failed', code: 'timeout' });
  });

  it('stops asking once stopped', async () => {
    const api = createFakeApi();
    api.practisedLastWeek({}, 'pending');
    const clock = manualTimers();
    const follower = createWeekReviewFollower(api, WEEK, undefined, clock.timers);

    follower.start(FAKE_WEEK_REVIEW);
    await settled();
    follower.stop();

    expect(clock.pending).toEqual([]);
  });
});
