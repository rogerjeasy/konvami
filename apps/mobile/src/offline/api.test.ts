import { ApiError } from '@konvami/api-client';
import { createFakeApi } from '@/test/fake-api';
import { createOfflineCache, type OfflineDisk } from './cache';
import { createOfflineApi } from './api';
import { DEFAULT_WEIGHTS } from './scheduler';

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
    expect(await offline.getDueCards()).toEqual({ ...saved, offline: true });
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
    const send = api.syncCardReviews;
    api.syncCardReviews = jest.fn().mockRejectedValue(new ApiError('network'));
    const projected = await offline.reviewCard(card.id, 'good');
    expect(projected.reviews).toBe(card.reviews + 1);
    expect(await offline.pendingReviews()).toBe(1);
    const restored = createOfflineApi(api, cache, Date.now);
    api.syncCardReviews = send;
    await restored.syncReviews();
    expect(await restored.pendingReviews()).toBe(0);
    expect((await api.getCard(card.id)).reviews).toBe(card.reviews + 1);
  });
  it('does not restore a rated card when reads work but review writes are offline', async () => {
    const { api, offline } = await setup();
    const due = await offline.getDueCards();
    const card = due.cards[0]!.card;
    api.syncCardReviews = jest.fn().mockRejectedValue(new ApiError('network'));
    await offline.reviewCard(card.id, 'good');
    const reopened = await offline.getDueCards();
    expect(reopened.cards.some((item) => item.card.id === card.id)).toBe(false);
    expect(await offline.pendingReviews()).toBe(1);
  });
  it('resolves a lost successful response without applying the rating twice', async () => {
    const { api, offline } = await setup();
    const due = await offline.getDueCards();
    const card = due.cards[0]!.card;
    const original = api.syncCardReviews;
    // The server stored the rating, but its answer never arrived.
    api.syncCardReviews = jest.fn(async (reviews) => {
      await original(reviews);
      throw new ApiError('network');
    });
    await offline.reviewCard(card.id, 'good');
    expect(await offline.pendingReviews()).toBe(1);
    api.syncCardReviews = original;
    await offline.syncReviews();
    expect(await offline.pendingReviews()).toBe(0);
    expect((await api.getCard(card.id)).reviews).toBe(card.reviews + 1);
  });
  it('sends every rating given offline in one batch, in the order given', async () => {
    const { api, offline } = await setup();
    const due = await offline.getDueCards();
    const [first, second] = due.cards.map((item) => item.card);
    const send = api.syncCardReviews;
    api.syncCardReviews = jest.fn().mockRejectedValue(new ApiError('network'));
    await offline.reviewCard(first!.id, 'again');
    await offline.reviewCard(second!.id, 'easy');
    api.syncCardReviews = jest.fn(send);
    await offline.syncReviews();
    expect(api.syncCardReviews).toHaveBeenCalledTimes(1);
    const [sent] = jest.mocked(api.syncCardReviews).mock.calls[0]!;
    expect(sent.map((item) => [item.cardId, item.rating, item.expectedReviews])).toEqual([
      [first!.id, 'again', first!.reviews],
      [second!.id, 'easy', second!.reviews],
    ]);
    expect(new Set(sent.map((item) => item.clientId)).size).toBe(2);
  });
  it('takes the server’s card when another device reviewed it first', async () => {
    const { api, offline } = await setup();
    const due = await offline.getDueCards();
    const card = due.cards[0]!.card;
    const send = api.syncCardReviews;
    api.syncCardReviews = jest.fn().mockRejectedValue(new ApiError('network'));
    await offline.reviewCard(card.id, 'again');
    // Another device rates the card meanwhile; its rating stands, this phone's is dropped.
    await api.reviewCard(card.id, 'easy');
    api.syncCardReviews = send;
    await offline.syncReviews();
    expect(await offline.pendingReviews()).toBe(0);
    const server = await api.getCard(card.id);
    expect(server.reviews).toBe(card.reviews + 1);
    expect(api.calls.filter(([method]) => method === 'syncCardReviews')).toHaveLength(1);
  });
  it('forgets the ratings of a card removed on the server', async () => {
    const { api, offline } = await setup();
    const due = await offline.getDueCards();
    const card = due.cards[0]!.card;
    const send = api.syncCardReviews;
    api.syncCardReviews = jest.fn().mockRejectedValue(new ApiError('network'));
    await offline.reviewCard(card.id, 'good');
    await api.removeCard(card.id);
    api.syncCardReviews = send;
    await offline.syncReviews();
    expect(await offline.pendingReviews()).toBe(0);
  });
  it('reviews offline the cards that come due in the days after the last connection', async () => {
    const { api, cache } = await setup();
    let at = Date.parse('2026-10-23T12:00:00Z');
    const offline = createOfflineApi(api, cache, () => at);
    const due = await offline.getDueCards();
    const card = due.cards[0]!.card;
    await offline.reviewCard(card.id, 'good');
    expect(api.calls.some(([method]) => method === 'getCardsAhead')).toBe(true);
    // Three days later, with no connection: the card that came back after two days is there.
    api.getDueCards = jest.fn().mockRejectedValue(new ApiError('network'));
    api.syncCardReviews = jest.fn().mockRejectedValue(new ApiError('network'));
    at += 3 * 86_400_000;
    const later = await offline.getDueCards();
    expect(later.offline).toBe(true);
    expect(later.cards.map((item) => item.card.id)).toContain(card.id);
  });
  it('schedules offline with the learner’s own parameters when the server has fitted them', async () => {
    const { api, offline } = await setup();
    const ahead = api.getCardsAhead.bind(api);
    // A learner whose new cards rated "good" stay ten days instead of the published 2.3.
    const own = [...DEFAULT_WEIGHTS];
    own[2] = 10;
    api.getCardsAhead = async () => ({ ...(await ahead()), weights: own, retention: 0.9 });
    const online = await offline.getDueCards();
    const fresh = online.cards.find((item) => item.card.reviews === 0)!.card;
    api.getDueCards = jest.fn().mockRejectedValue(new ApiError('network'));

    const queue = await offline.getDueCards();

    const item = queue.cards.find((candidate) => candidate.card.id === fresh.id)!;
    expect(queue.offline).toBe(true);
    expect(item.dueIn.good).toBe(10 * 86_400);
  });
  it('says a queue read from the phone is offline, and one from the server is not', async () => {
    const { api, offline } = await setup();
    expect((await offline.getDueCards()).offline).toBeUndefined();
    api.getDueCards = jest.fn().mockRejectedValue(new ApiError('network'));
    expect((await offline.getDueCards()).offline).toBe(true);
  });
  it('keeps a card’s sound the first time it plays, to play it offline', async () => {
    const { api, cache } = await setup();
    const media = {
      download: jest.fn(async (_url: string, key: string) => `file:///sounds/${key}`),
      remove: jest.fn(async () => {}),
    };
    const offline = createOfflineApi(api, cache, Date.now, media);
    const card = (await offline.getDueCards()).cards[0]!.card;
    expect((await offline.getCardAudio(card.id)).url).toBe(`file:///sounds/card-${card.id}`);
    await offline.getCardAudio(card.id);
    expect(media.download).toHaveBeenCalledTimes(1);
    api.getCardAudio = jest.fn().mockRejectedValue(new ApiError('network'));
    expect((await offline.getCardAudio(card.id)).url).toBe(`file:///sounds/card-${card.id}`);
    await offline.clearSounds();
    expect(media.remove).toHaveBeenCalledWith(`file:///sounds/card-${card.id}`);
    await expect(offline.getCardAudio(card.id)).rejects.toMatchObject({ code: 'network' });
  });
  it('plays a sound from the server when it cannot be kept', async () => {
    const { api, cache } = await setup();
    const media = {
      download: jest.fn().mockRejectedValue(new Error('storage_limit')),
      remove: jest.fn(async () => {}),
    };
    const offline = createOfflineApi(api, cache, Date.now, media);
    const card = (await offline.getDueCards()).cards[0]!.card;
    const { url } = await api.getCardAudio(card.id);
    expect((await offline.getCardAudio(card.id)).url).toBe(url);
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
