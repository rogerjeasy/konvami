import type { Plan } from '@konvami/api-client';

// The store tells the server about a purchase by webhook, a few seconds after the learner has
// paid: the plan is read again at this pace until it shows what they bought.
export const PLAN_POLL_ATTEMPTS = 6;
export const PLAN_POLL_WAIT_MS = 2000;

/** Whether `after` shows a purchase `before` does not: another plan, or more minutes bought. */
export function planChanged(before: Plan | null, after: Plan): boolean {
  if (!before) return false;
  return (
    before.tier !== after.tier ||
    before.trial !== after.trial ||
    before.packSeconds !== after.packSeconds ||
    before.expiresAt !== after.expiresAt
  );
}

/**
 * Reads the plan until it differs from `before` or the attempts run out; returns whether it
 * changed. `read` reads the plan (and shows it); `wait` is how the pause is made.
 */
export async function readUntilChanged(
  before: Plan | null,
  read: () => Promise<Plan | null>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<boolean> {
  for (let attempt = 0; attempt < PLAN_POLL_ATTEMPTS; attempt += 1) {
    await wait(PLAN_POLL_WAIT_MS);
    const now = await read();
    if (now && planChanged(before, now)) return true;
  }
  return false;
}
