import { randomUuid } from '@/lib/random-id';
import { readItem, removeItem, writeItem } from '@/lib/storage';

/**
 * The id analytics events carry (spec §6.21.4): random, made the first time an event is sent after
 * the learner agreed, never tied to the account, and forgotten when they withdraw. It lives apart
 * from the sender so the preferences can forget it without importing the sender (which reads the
 * preferences).
 */
export const INSTALL_ID_KEY = 'konvami.analytics.id';

let pending: Promise<string> | null = null;
// Counts withdrawals, so an id being made while the learner withdraws is not saved afterwards.
let withdrawals = 0;

/** The install id, made and saved the first time it is needed. */
export function installId(): Promise<string> {
  const started = withdrawals;
  pending ??= readItem(INSTALL_ID_KEY).then(async (saved) => {
    if (saved) return saved;
    // Random for this install: not an account id, and not a security token.
    const made = randomUuid();
    if (started === withdrawals) {
      await writeItem(INSTALL_ID_KEY, made);
      // The learner withdrew while it was being saved: take it back out.
      if (started !== withdrawals) await removeItem(INSTALL_ID_KEY);
    }
    return made;
  });
  return pending;
}

/** Forgets the install id, as the learner withdraws: a later "yes" starts a new, unrelated one. */
export async function forgetAnalyticsId(): Promise<void> {
  withdrawals += 1;
  pending = null;
  await removeItem(INSTALL_ID_KEY);
}
