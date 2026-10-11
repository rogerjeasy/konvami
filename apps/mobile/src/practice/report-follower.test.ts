import { createFakeApi, FAKE_REPORT } from '@/test/fake-api';
import { createReportFollower, MAX_POLLS, POLL_MS, type ReportView } from './report-follower';

/** Timers a test runs by hand: `tick` runs the one that is waiting, `waiting` says for how long. */
function manualTimers() {
  let pending: { run: () => void; ms: number } | null = null;
  return {
    timers: {
      set: (run: () => void, ms: number) => (pending = { run, ms }),
      clear: () => (pending = null),
    },
    waiting: () => pending?.ms ?? null,
    tick() {
      const due = pending;
      pending = null;
      due?.run();
    },
  };
}

/** Lets the answers that are already on their way arrive. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup() {
  const api = createFakeApi();
  api.enterApp();
  api.talked(0, { id: 'rtc_1' });
  const clock = manualTimers();
  const follower = createReportFollower(api, 'rtc_1', clock.timers);
  const reads = () => api.calls.filter(([method]) => method === 'getConversationReport').length;
  const asked = () => api.calls.filter(([method]) => method === 'requestConversationReport').length;
  return { api, follower, clock, reads, asked };
}

describe('report follower', () => {
  it('reads a report that is ready, once', async () => {
    const { api, follower, clock, reads } = setup();
    api.reported('rtc_1');

    follower.start();
    expect(follower.getState()).toEqual({ phase: 'loading' });
    await settle();

    expect(follower.getState()).toEqual({ phase: 'ready', report: FAKE_REPORT });
    expect(clock.waiting()).toBeNull();
    expect(reads()).toBe(1);
  });

  it.each([
    ['none', { phase: 'none' }],
    ['too_short', { phase: 'tooShort' }],
    ['failed', { phase: 'failed', code: 'failed' }],
  ] as const)('says when the report is %s', async (status, view) => {
    const { api, follower, clock } = setup();
    if (status !== 'none') api.reported('rtc_1', status);

    follower.start();
    await settle();

    expect(follower.getState()).toEqual(view);
    expect(clock.waiting()).toBeNull();
  });

  it('keeps asking while the report is being written', async () => {
    const { api, follower, clock, reads } = setup();
    api.reported('rtc_1', 'pending');

    follower.start();
    await settle();
    expect(follower.getState()).toEqual({ phase: 'writing' });
    expect(clock.waiting()).toBe(POLL_MS);

    clock.tick();
    await settle();
    expect(follower.getState()).toEqual({ phase: 'writing' });

    api.reported('rtc_1');
    clock.tick();
    await settle();

    expect(follower.getState()).toEqual({ phase: 'ready', report: FAKE_REPORT });
    expect(reads()).toBe(3);
    expect(clock.waiting()).toBeNull();
  });

  it('gives up on a report that never arrives', async () => {
    const { api, follower, clock, reads } = setup();
    api.reported('rtc_1', 'pending');

    follower.start();
    await settle();
    for (let poll = 0; poll < MAX_POLLS; poll += 1) {
      clock.tick();
      await settle();
    }

    expect(follower.getState()).toEqual({ phase: 'failed', code: 'timeout' });
    expect(clock.waiting()).toBeNull();
    expect(reads()).toBe(MAX_POLLS + 1);
  });

  it('says why a report could not be read, and reads it again when asked', async () => {
    const { api, follower } = setup();
    api.reported('rtc_1');
    api.failNext('getConversationReport', 'network');

    follower.start();
    await settle();
    expect(follower.getState()).toEqual({ phase: 'failed', code: 'network' });

    follower.start();
    expect(follower.getState()).toEqual({ phase: 'loading' });
    await settle();
    expect(follower.getState().phase).toBe('ready');
  });

  it('keeps following through a hiccup while the report is being written', async () => {
    const { api, follower, clock } = setup();
    api.reported('rtc_1', 'pending');
    follower.start();
    await settle();
    api.failNext('getConversationReport', 'network');

    clock.tick();
    await settle();

    expect(follower.getState()).toEqual({ phase: 'writing' });
    expect(clock.waiting()).toBe(POLL_MS);
  });

  it('asks for a report and follows it until it is written', async () => {
    const { api, follower, clock, asked } = setup();
    follower.start();
    await settle();

    const asking = follower.request();
    expect(follower.getState()).toEqual({ phase: 'writing' });
    await asking;
    expect(asked()).toBe(1);
    expect(clock.waiting()).toBe(POLL_MS);

    api.reported('rtc_1');
    clock.tick();
    await settle();

    expect(follower.getState()).toEqual({ phase: 'ready', report: FAKE_REPORT });
  });

  it('says why a report could not be asked for', async () => {
    const { api, follower, clock } = setup();
    follower.start();
    await settle();
    api.failNext('requestConversationReport', 'consent_required');

    await follower.request();

    expect(follower.getState()).toEqual({ phase: 'failed', code: 'consent_required' });
    expect(clock.waiting()).toBeNull();
  });

  it('tells its listeners about every change until they unsubscribe', async () => {
    const { api, follower } = setup();
    api.reported('rtc_1');
    const seen: ReportView['phase'][] = [];
    const unsubscribe = follower.subscribe(() => seen.push(follower.getState().phase));

    follower.start();
    await settle();
    unsubscribe();
    follower.start();
    await settle();

    expect(seen).toEqual(['loading', 'ready']);
  });

  it('stops asking, and drops an answer that arrives after it was stopped', async () => {
    const { api, follower, clock, reads } = setup();
    api.reported('rtc_1', 'pending');
    follower.start();
    await settle();

    follower.stop();
    expect(clock.waiting()).toBeNull();

    const release = api.hold('getConversationReport');
    follower.start();
    follower.stop();
    api.reported('rtc_1');
    release();
    await settle();

    expect(follower.getState()).toEqual({ phase: 'loading' });
    expect(reads()).toBe(2);
  });
});
