/** Device persistence must reject failed writes: unsent reviews cannot be acknowledged in memory only. */
export interface OfflineDisk {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface OfflineCache {
  account(): string | null;
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}
interface Envelope {
  version: 1;
  entries: Record<string, unknown>;
}
// Bound opportunistic browsing snapshots; intentional pins and unsent learning data are durable.
const MAX_SNAPSHOTS = 100;
const isSnapshot = (key: string) => /^(deck|library|timing|transcript|card):/.test(key);
const empty = (): Envelope => ({ version: 1, entries: {} });
const keyOf = (account: string) => `learning-v1-${encodeURIComponent(account)}`;

export function createOfflineCache(disk: OfflineDisk, account: () => string | null): OfflineCache {
  // Every write updates one atomic account document. Serializing prevents competing screens
  // overwriting one another's outbox or bookmarks with an earlier read.
  let pending: Promise<unknown> = Promise.resolve();
  async function read(owner: string): Promise<Envelope> {
    const raw = await disk.read(keyOf(owner));
    if (!raw) return empty();
    try {
      const value = JSON.parse(raw) as Partial<Envelope>;
      return value.version === 1 &&
        value.entries &&
        typeof value.entries === 'object' &&
        !Array.isArray(value.entries)
        ? (value as Envelope)
        : empty();
    } catch {
      return empty();
    }
  }
  function change(update: (document: Envelope) => void) {
    const owner = account();
    if (!owner) return Promise.reject(new Error('signed_out'));
    const next = pending.then(async () => {
      if (account() !== owner) throw new Error('account_changed');
      const document = await read(owner);
      update(document);
      await disk.write(keyOf(owner), JSON.stringify(document));
      if (account() !== owner) {
        await disk.remove(keyOf(owner));
        throw new Error('account_changed');
      }
    });
    pending = next.catch(() => {});
    return next;
  }
  return {
    account,
    async get<T>(key: string) {
      const owner = account();
      if (!owner) return null;
      await pending;
      const document = await read(owner);
      return account() === owner ? ((document.entries[key] as T | undefined) ?? null) : null;
    },
    put: (key, value) =>
      change((document) => {
        // Reinsertion moves a refreshed snapshot to the end without trusting the device clock.
        delete document.entries[key];
        document.entries[key] = value;
        const pinned = document.entries.pinned as Record<string, unknown> | undefined;
        const snapshots = Object.keys(document.entries).filter((entry) =>
          isSnapshot(entry) && !(entry.startsWith('transcript:') && pinned?.[entry.slice('transcript:'.length)]));
        for (const oldest of snapshots.slice(0, Math.max(0, snapshots.length - MAX_SNAPSHOTS))) {
          delete document.entries[oldest];
        }
      }),
    remove: (key) =>
      change((document) => {
        delete document.entries[key];
      }),
    async clear() {
      const owner = account();
      if (!owner) return;
      await pending;
      await disk.remove(keyOf(owner));
    },
  };
}
