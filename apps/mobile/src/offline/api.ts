import {
  ApiError,
  type ApiClient,
  type Card,
  type Rating,
  type ReviewQueue,
  type SyncedReview,
} from '@konvami/api-client';
import { randomUuid } from '@/lib/random-id';
import type { OfflineCache } from './cache';
import type { LibraryMedia } from './library';
import { intervalDays, reviewMemory, type CardMemory } from './scheduler';

const DAY_MS = 86_400_000;
// A card that was not known comes back this soon (the server's AGAIN_DELAY).
const AGAIN_MS = 600_000;
const STATE_KEY = 'review-state';
const SOUNDS_KEY = 'card-sounds';
const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
// The most ratings one sync sends (the server's SYNC_MAX).
const SYNC_MAX = 200;
// The most card sounds kept on the phone: about a week's reviews of a large deck. The oldest
// one played goes first.
const MAX_SOUNDS = 300;
type StoredCard = Card & { memory?: CardMemory | null };
interface ReviewEvent {
  /** The phone's id for this rating: a sync sent twice stores it once. */
  clientId: string;
  cardId: string;
  rating: Rating;
  expectedReviews: number;
  reviewedAt: string;
}
interface ReviewState {
  cards: Record<string, StoredCard>;
  pending: ReviewEvent[];
  language: string;
}
/** Where each card's sound was saved on the phone, in the order they were first played. */
type SoundFiles = Record<string, string>;
/** The review queue, and whether it was read from the phone because the network is not there. */
export type OfflineReviewQueue = ReviewQueue & { offline?: true };

const empty = (): ReviewState => ({ cards: {}, pending: [], language: '' });
const networkFailure = (error: unknown) => error instanceof ApiError && error.code === 'network';

function reviewed(card: StoredCard, rating: Rating, at: number): StoredCard {
  // Old cache entries cannot reconstruct stability. Only new cards or cards delivered with
  // memory from the server can be scheduled offline without inventing their history.
  if (card.reviews > 0 && !card.memory) throw new ApiError('offline_refresh_required');
  const days = card.reviewedAt
    ? Math.max(0, Math.floor((at - Date.parse(card.reviewedAt)) / DAY_MS))
    : 0;
  const memory = reviewMemory(card.memory ?? null, days, rating);
  return {
    ...card,
    memory,
    reviewedAt: new Date(at).toISOString(),
    dueAt: new Date(
      at + (rating === 'again' ? AGAIN_MS : intervalDays(memory) * DAY_MS),
    ).toISOString(),
    reviews: card.reviews + 1,
    lapses: card.lapses + (rating === 'again' && card.memory && days >= 1 ? 1 : 0),
  };
}

/**
 * The learning API with an offline side (spec §10.3). Reads are cached and fall back to the
 * last copy only when the network is gone, never on a server refusal. The cards due in the next
 * week are kept on the phone; ratings given offline are scheduled here with the same FSRS as
 * the server and queued, then sent in one batch in the order they were given. The server's card
 * wins: a rating made on a card that changed on the server meanwhile is dropped there, and the
 * phone takes the server's card.
 */
export function createOfflineApi<
  T extends Pick<
    ApiClient,
    | 'getDueCards'
    | 'getCardsAhead'
    | 'syncCardReviews'
    | 'reviewCard'
    | 'getCard'
    | 'getCards'
    | 'getCardAudio'
    | 'getConversations'
    | 'getConversation'
    | 'getRecordingTiming'
  >,
>(
  api: T,
  cache: OfflineCache,
  now: () => number,
  media?: Pick<LibraryMedia, 'download' | 'remove' | 'resolve'>,
) {
  let work: Promise<unknown> = Promise.resolve();
  const serial = <R>(action: () => Promise<R>): Promise<R> => {
    const result = work.then(action);
    work = result.catch(() => {});
    return result;
  };
  async function state(): Promise<ReviewState> {
    const data = (await cache.get<ReviewState>(STATE_KEY)) ?? empty();
    // Ratings queued before ratings had ids get one now, before they are first sent.
    for (const event of data.pending) event.clientId ??= randomUuid();
    return data;
  }
  const assertOwner = (owner: string | null) => {
    if (!owner || cache.account() !== owner) throw new ApiError('not_authorized', 401);
  };
  async function cached<R>(key: string, request: () => Promise<R>): Promise<R> {
    const owner = cache.account();
    assertOwner(owner);
    try {
      const value = await request();
      assertOwner(owner);
      // Browsing remains usable when the device is full; reviews use a strict write below.
      await cache.put(key, value).catch(() => {});
      assertOwner(owner);
      return value;
    } catch (error) {
      assertOwner(owner);
      if (error instanceof ApiError && error.code === 'not_found') await cache.remove(key);
      if (!networkFailure(error)) throw error;
      const previous = await cache.get<R>(key);
      if (previous === null) throw error;
      return previous;
    }
  }

  /** Takes in what the server did with each rating of a sync. */
  function settle(data: ReviewState, results: SyncedReview[]) {
    for (const result of results) {
      const event = data.pending.find((item) => item.clientId === result.clientId);
      if (!event) continue;
      data.pending = data.pending.filter((item) => item.clientId !== result.clientId);
      const { cardId } = event;
      if (result.outcome === 'removed' || !result.card) {
        delete data.cards[cardId];
        data.pending = data.pending.filter((item) => item.cardId !== cardId);
        continue;
      }
      // The ratings made after a dropped one were made on top of it: they go too.
      if (result.outcome === 'superseded')
        data.pending = data.pending.filter((item) => item.cardId !== cardId);
      if (!data.pending.some((item) => item.cardId === cardId)) data.cards[cardId] = result.card;
    }
  }

  async function flush() {
    const owner = cache.account();
    assertOwner(owner);
    let data = await state();
    while (data.pending.length) {
      const batch = data.pending.slice(0, SYNC_MAX);
      let synced: SyncedReview[];
      try {
        synced = (await api.syncCardReviews(batch)).results;
      } catch (error) {
        assertOwner(owner);
        if (networkFailure(error)) return;
        throw error;
      }
      assertOwner(owner);
      data = await state();
      settle(data, synced);
      // An answer that settles nothing would send the same batch for ever.
      const settled = batch.filter((event) =>
        data.pending.every((item) => item.clientId !== event.clientId),
      ).length;
      await cache.put(STATE_KEY, data);
      if (!settled) return;
      data = await state();
    }
  }

  /** Keeps the cards due in the next week, as the server has them, except those with ratings
   * still to send. Cards the server no longer has are forgotten. */
  async function keepAhead(owner: string | null, data: ReviewState, queue: ReviewQueue) {
    let ahead: Card[];
    try {
      ahead = (await api.getCardsAhead()).cards;
    } catch {
      // Reviewing goes on; the cards stay as they were.
      return;
    }
    assertOwner(owner);
    const pendingIds = new Set(data.pending.map((event) => event.cardId));
    const kept: Record<string, StoredCard> = {};
    for (const id of pendingIds) if (data.cards[id]) kept[id] = data.cards[id];
    for (const card of [...ahead, ...queue.cards.map((item) => item.card)])
      if (!pendingIds.has(card.id)) kept[card.id] = card;
    data.cards = kept;
  }

  async function offlineQueue(limit?: number): Promise<OfflineReviewQueue | null> {
    const data = await state();
    if (!data.language) return null;
    const at = now();
    const cards = Object.values(data.cards)
      // A card reviewed before without its memory cannot be scheduled here; it waits for the
      // network rather than stopping the others.
      .filter((card) => Date.parse(card.dueAt) <= at && (card.reviews === 0 || card.memory))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return {
      offline: true,
      language: data.language,
      due: cards.length,
      cards: cards.slice(0, limit).map((card) => ({
        card,
        dueIn: Object.fromEntries(
          RATINGS.map((rating) => [
            rating,
            (Date.parse(reviewed(card, rating, at).dueAt) - at) / 1000,
          ]),
        ) as ReviewQueue['cards'][number]['dueIn'],
      })),
    };
  }

  /** Where a saved sound plays from: on the web, the saved copy is opened first. */
  async function playable(saved: string): Promise<string> {
    return media?.resolve ? media.resolve(saved) : saved;
  }

  /** Saves a card's sound on the phone the first time it plays, to play it again offline. */
  async function keepSound(id: string, url: string): Promise<string> {
    if (!media) return url;
    const owner = cache.account();
    const sounds = (await cache.get<SoundFiles>(SOUNDS_KEY)) ?? {};
    let saved = sounds[id];
    if (saved) return playable(saved).catch(() => url);
    try {
      saved = await media.download(url, `card-${id}`, 'mp3');
    } catch {
      // Not saved (no space, a download that broke off): it plays from the server.
      return url;
    }
    assertOwner(owner);
    sounds[id] = saved;
    const ids = Object.keys(sounds);
    for (const old of ids.slice(0, Math.max(0, ids.length - MAX_SOUNDS))) {
      await media.remove(sounds[old]!).catch(() => {});
      delete sounds[old];
    }
    await cache.put(SOUNDS_KEY, sounds).catch(() => {});
    return playable(saved).catch(() => url);
  }

  const offline = {
    syncReviews: () => serial(flush),
    pendingReviews: async () => (await state()).pending.length,
    /** Deletes the card sounds saved on the phone (signing out, deleting the account). */
    clearSounds: async () => {
      const sounds = (await cache.get<SoundFiles>(SOUNDS_KEY)) ?? {};
      if (media) for (const uri of Object.values(sounds)) await media.remove(uri).catch(() => {});
      await cache.remove(SOUNDS_KEY);
    },
    getCards: (page?: Parameters<T['getCards']>[0]) =>
      cached(`deck:${JSON.stringify(page ?? {})}`, () => api.getCards(page)),
    getConversations: (page?: Parameters<T['getConversations']>[0]) =>
      cached(`library:${JSON.stringify(page ?? {})}`, () => api.getConversations(page)),
    getRecordingTiming: (id: string, index: number) =>
      cached(`timing:${id}:${index}`, () => api.getRecordingTiming(id, index)),
    getConversation: (id: string) => cached(`transcript:${id}`, () => api.getConversation(id)),
    getCard: (id: string) => cached(`card:${id}`, () => api.getCard(id)),
    getCardAudio: async (id: string): Promise<{ url: string }> => {
      try {
        const { url } = await api.getCardAudio(id);
        return { url: await keepSound(id, url) };
      } catch (error) {
        if (!networkFailure(error)) throw error;
        const saved = (await cache.get<SoundFiles>(SOUNDS_KEY))?.[id];
        if (!saved) throw error;
        return { url: await playable(saved) };
      }
    },
    getDueCards: (limit?: number): Promise<OfflineReviewQueue> =>
      serial(async () => {
        await flush();
        const owner = cache.account();
        try {
          const queue = await api.getDueCards(limit);
          assertOwner(owner);
          const data = await state();
          data.language = queue.language;
          const pendingIds = new Set(data.pending.map((event) => event.cardId));
          for (const item of queue.cards)
            if (!pendingIds.has(item.card.id)) data.cards[item.card.id] = item.card;
          await keepAhead(owner, data, queue);
          const cards = queue.cards.filter((item) => !pendingIds.has(item.card.id));
          const merged = {
            ...queue,
            cards,
            due: Math.max(cards.length, queue.due - (queue.cards.length - cards.length)),
          };
          await cache.put(STATE_KEY, data);
          return merged;
        } catch (error) {
          assertOwner(owner);
          if (!networkFailure(error)) throw error;
          const queue = await offlineQueue(limit);
          if (!queue) throw error;
          return queue;
        }
      }),
    reviewCard: (id: string, rating: Rating): Promise<Card> =>
      serial(async () => {
        const owner = cache.account();
        assertOwner(owner);
        const data = await state();
        const before = data.cards[id];
        if (!before) return api.reviewCard(id, rating);
        const at = Math.max(now(), Date.parse(before.reviewedAt ?? before.createdAt));
        const after = reviewed(before, rating, at);
        const event: ReviewEvent = {
          clientId: randomUuid(),
          cardId: id,
          rating,
          expectedReviews: before.reviews,
          reviewedAt: new Date(at).toISOString(),
        };
        data.pending.push(event);
        data.cards[id] = after;
        await cache.put(STATE_KEY, data);
        try {
          await flush();
        } catch (error) {
          assertOwner(owner);
          if (
            error instanceof ApiError &&
            ['not_authenticated', 'not_authorized', 'invalid_value', 'consent_required'].includes(
              error.code,
            )
          ) {
            const rejected = await state();
            rejected.pending = rejected.pending.filter((item) => item.clientId !== event.clientId);
            rejected.cards[id] = before;
            await cache.put(STATE_KEY, rejected);
          }
          throw error;
        }
        assertOwner(owner);
        return (await state()).cards[id] ?? after;
      }),
  };
  // Spreading `api` alone would type each replaced method as both versions at once.
  return { ...api, ...offline } as Omit<T, keyof typeof offline> & typeof offline;
}
