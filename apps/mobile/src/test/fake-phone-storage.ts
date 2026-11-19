import { createOfflineCache, type OfflineCache } from '@/offline/cache';
import { TEST_ACCOUNT } from '@/test/render';

/** The phone's offline store, kept in memory for the signed-in test account: one per phone. */
export function createPhoneStorage(account: string = TEST_ACCOUNT.email): OfflineCache {
  const files = new Map<string, string>();
  return createOfflineCache(
    {
      read: async (key) => files.get(key) ?? null,
      write: async (key, value) => void files.set(key, value),
      remove: async (key) => void files.delete(key),
    },
    () => account,
  );
}
