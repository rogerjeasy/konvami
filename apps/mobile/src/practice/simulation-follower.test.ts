import { createFakeApi, FAKE_SIMULATION_RESULT } from '@/test/fake-api';
import { createSimulationFollower, POLL_MS } from './simulation-follower';

function manualTimers() {
  const pending: { run: () => void; ms: number }[] = [];
  return {
    pending,
    timers: {
      set: (run: () => void, ms: number) => pending.push({ run, ms }),
      clear: () => void pending.splice(0),
    },
    tick: () => pending.shift()?.run(),
  };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('following a simulation’s score', () => {
  it('waits while it is being written, then shows it', async () => {
    const api = createFakeApi();
    api.simulated('rtc_1', { status: 'pending' });
    const clock = manualTimers();
    const follower = createSimulationFollower(api, 'rtc_1', clock.timers);

    await follower.follow();
    expect(follower.getState()).toEqual({ phase: 'writing' });
    expect(clock.pending[0]?.ms).toBe(POLL_MS);
    clock.tick();
    await settled();

    const state = follower.getState();
    expect(state.phase).toBe('ready');
    expect(state.phase === 'ready' && state.value.result).toEqual(FAKE_SIMULATION_RESULT);
  });

  it('says why it has none: too little said, or the scorer failed', async () => {
    const api = createFakeApi();
    api.simulated('rtc_short', { status: 'too_short' });
    api.simulated('rtc_failed', { status: 'failed' });

    const short = createSimulationFollower(api, 'rtc_short', manualTimers().timers);
    const failed = createSimulationFollower(api, 'rtc_failed', manualTimers().timers);
    await short.follow();
    await failed.follow();

    expect(short.getState()).toEqual({ phase: 'failed', code: 'too_short' });
    expect(failed.getState()).toEqual({ phase: 'failed', code: 'failed' });
  });

  it('asks again for a score that failed', async () => {
    const api = createFakeApi();
    api.simulated('rtc_1', { status: 'failed' });
    const follower = createSimulationFollower(api, 'rtc_1', manualTimers().timers);

    await follower.request();

    expect(follower.getState()).toEqual({ phase: 'writing' });
    expect(api.calls.at(-1)).toEqual(['rescoreSimulation', 'rtc_1']);
  });
});
