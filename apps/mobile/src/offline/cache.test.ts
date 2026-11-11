import { createOfflineCache, type OfflineDisk } from './cache';

const disk = (): OfflineDisk => {
  const data = new Map<string, string>();
  return {
    read: async (key) => data.get(key) ?? null,
    write: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
};

describe('offline cache', () => {
  it('survives recreation and never reads another account data', async () => {
    const files = disk();
    await createOfflineCache(files, () => 'alice').put('cards', { word: 'hello' });
    expect(await createOfflineCache(files, () => 'alice').get('cards')).toEqual({ word: 'hello' });
    expect(await createOfflineCache(files, () => 'bob').get('cards')).toBeNull();
    expect(await createOfflineCache(files, () => null).get('cards')).toBeNull();
  });
  it('bounds browsing snapshots while retaining queued learning data', async () => {
    const cache = createOfflineCache(disk(), () => 'alice');
    await cache.put('review-state', { pending: ['review'] });
    for (let index = 0; index < 110; index++)
      await cache.put(`transcript:${index}`, { text: 'hello' });
    expect(await cache.get('transcript:0')).toBeNull();
    expect(await cache.get('transcript:109')).toEqual({ text: 'hello' });
    expect(await cache.get('review-state')).toEqual({ pending: ['review'] });
  });
  it('purges all cached personal data on sign-out', async () => {
    const cache = createOfflineCache(disk(), () => 'alice');
    await cache.put('cards', [1]);
    await cache.put('transcript/1', [2]);
    await cache.clear();
    expect(await cache.get('cards')).toBeNull();
    expect(await cache.get('transcript/1')).toBeNull();
  });
  it('treats corrupt storage as absent but does not hide failed writes', async () => {
    const files: OfflineDisk = {
      read: async () => '{bad',
      write: async () => {
        throw new Error('disk full');
      },
      remove: async () => {},
    };
    const cache = createOfflineCache(files, () => 'alice');
    expect(await cache.get('cards')).toBeNull();
    await expect(cache.put('cards', [1])).rejects.toThrow('disk full');
  });
});
