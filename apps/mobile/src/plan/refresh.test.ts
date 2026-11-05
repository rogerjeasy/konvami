import type { Plan } from '@konvami/api-client';
import { FAKE_SUBSCRIPTION } from '@/test/fake-api';
import { PLAN_POLL_ATTEMPTS, planChanged, readUntilChanged } from './refresh';

const PLUS: Plan = { ...FAKE_SUBSCRIPTION, tier: 'plus', expiresAt: '2026-12-01T00:00:00Z' };
const noWait = async () => {};

describe('planChanged', () => {
  it('sees another plan, a trial, minutes from a pack or a new end date', () => {
    expect(planChanged(FAKE_SUBSCRIPTION, PLUS)).toBe(true);
    expect(planChanged(PLUS, { ...PLUS, trial: true })).toBe(true);
    expect(planChanged(FAKE_SUBSCRIPTION, { ...FAKE_SUBSCRIPTION, packSeconds: 3600 })).toBe(true);
    expect(planChanged(PLUS, { ...PLUS, expiresAt: '2027-01-01T00:00:00Z' })).toBe(true);
  });

  it('sees nothing in a plan that is as it was, or when nothing was known before', () => {
    expect(planChanged(PLUS, { ...PLUS })).toBe(false);
    expect(planChanged(null, PLUS)).toBe(false);
  });
});

describe('readUntilChanged', () => {
  it('stops as soon as the purchase shows', async () => {
    const answers = [FAKE_SUBSCRIPTION, FAKE_SUBSCRIPTION, PLUS];
    let reads = 0;

    const changed = await readUntilChanged(
      FAKE_SUBSCRIPTION,
      async () => answers[reads++] ?? PLUS,
      noWait,
    );

    expect(changed).toBe(true);
    expect(reads).toBe(3);
  });

  it('gives up after its attempts when the plan never changes', async () => {
    let reads = 0;

    const changed = await readUntilChanged(
      FAKE_SUBSCRIPTION,
      async () => {
        reads += 1;
        return FAKE_SUBSCRIPTION;
      },
      noWait,
    );

    expect(changed).toBe(false);
    expect(reads).toBe(PLAN_POLL_ATTEMPTS);
  });

  it('keeps trying when a read fails to give a plan', async () => {
    const answers = [null, PLUS];
    let reads = 0;

    expect(
      await readUntilChanged(FAKE_SUBSCRIPTION, async () => answers[reads++] ?? null, noWait),
    ).toBe(true);
  });
});
