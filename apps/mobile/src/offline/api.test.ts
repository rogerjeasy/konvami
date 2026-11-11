import { ApiError } from '@konvami/api-client';
import { createFakeApi } from '@/test/fake-api';
import { createOfflineCache, type OfflineDisk } from './cache';
import { createOfflineApi } from './api';

async function setup() {
  const files = new Map<string, string>();
  const disk: OfflineDisk = {
    read: async (key) => files.get(key) ?? null,
    write: async (key, value) => {
      files.set(key, value);
    },
    remove: async (key) => {
      files.delete(key);
    },
  };
  const api = createFakeApi();
  api.enterApp();
  await api.learning();
  const cache = createOfflineCache(disk, () => 'alice');
  const offline = createOfflineApi(api, cache, () => Date.parse('2026-10-23T12:00:00Z'));
  return { api, cache, offline };
}

describe('offline learning API', () => {
  it('reads the last saved cards when the transport is offline', async () => {
    const { api, offline } = await setup();
    const saved = await offline.getDueCards();
    api.getDueCards = jest.fn().mockRejectedValue(new ApiError('network'));
    expect(await offline.getDueCards()).toEqual(saved);
  });
  it('does not hide an authentication refusal behind cached personal data', async () => {
    const { api, offline } = await setup();
    await offline.getDueCards();
    api.getDueCards = jest.fn().mockRejectedValue(new ApiError('not_authorized', 401));
    await expect(offline.getDueCards()).rejects.toMatchObject({ code: 'not_authorized' });
  });
  it('queues a rating durably and flushes it after the network returns', async () => {
    const { api, cache, offline } = await setup();
    const due = await offline.getDueCards();
    const card = due.cards[0]!.card;
    const send = api.reviewCard;
    api.reviewCard = jest.fn().mockRejectedValue(new ApiError('network'));
    const projected = await offline.reviewCard(card.id, 'good');
    expect(projected.reviews).toBe(card.reviews + 1);
    expect(await offline.pendingReviews()).toBe(1);
    const restored = createOfflineApi(api, cache, Date.now);
    api.reviewCard = send;
    await restored.syncReviews();
    expect(await restored.pendingReviews()).toBe(0);
  });
  it('does not restore a rated card when reads work but review writes are offline', async () => {
    const { api, offline } = await setup();
    const due = await offline.getDueCards();
    const card = due.cards[0]!.card;
    api.reviewCard = jest.fn().mockRejectedValue(new ApiError('network'));
    await offline.reviewCard(card.id, 'good');
    const reopened = await offline.getDueCards();
    expect(reopened.cards.some((item) => item.card.id === card.id)).toBe(false);
    expect(await offline.pendingReviews()).toBe(1);
  });
  it('resolves a lost successful response without applying the rating twice', async () => {
    const { api, offline } = await setup();
    const due = await offline.getDueCards();
    const card = due.cards[0]!.card;
    const original = api.reviewCard;
    api.reviewCard = jest.fn(async (id, rating) => {
      await original(id, rating);
      throw new ApiError('network');
    });
    await offline.reviewCard(card.id, 'good');
    api.reviewCard = jest.fn().mockRejectedValue(new ApiError('conflict', 409));
    await offline.syncReviews();
    expect(await offline.pendingReviews()).toBe(0);
    expect((await api.getCard(card.id)).reviews).toBe(card.reviews + 1);
  });
  it('does not return another account response after an account switch', async () => {
    const { api } = await setup();
    let account = 'alice';
    const cache = createOfflineCache(
      { read: async () => null, write: async () => {}, remove: async () => {} },
      () => account,
    );
    const original = api.getDueCards;
    api.getDueCards = async () => {
      const result = await original();
      account = 'bob';
      return result;
    };
    const offline = createOfflineApi(api, cache, Date.now);
    await expect(offline.getDueCards()).rejects.toMatchObject({ code: 'not_authorized' });
  });
});
