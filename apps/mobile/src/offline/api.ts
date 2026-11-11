import {
  ApiError,
  type ApiClient,
  type Card,
  type Rating,
  type ReviewQueue,
} from '@konvami/api-client';
import type { OfflineCache } from './cache';
import { intervalDays, reviewMemory, type CardMemory } from './scheduler';

const DAY_MS = 86_400_000;
const AGAIN_MS = 600_000;
const STATE_KEY = 'review-state';
const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
type StoredCard = Card & { memory?: CardMemory | null };
interface ReviewEvent {
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

/** Caches only successful reads and falls back only on network loss, never on server refusals. */
export function createOfflineApi<
  T extends Pick<
    ApiClient,
    | 'getDueCards'
    | 'reviewCard'
    | 'getCard'
    | 'getCards'
    | 'getConversations'
    | 'getConversation'
    | 'getRecordingTiming'
  >,
>(api: T, cache: OfflineCache, now: () => number) {
  let work: Promise<unknown> = Promise.resolve();
  const serial = <R>(action: () => Promise<R>): Promise<R> => {
    const result = work.then(action);
    work = result.catch(() => {});
    return result;
  };
  async function state(): Promise<ReviewState> {
    return (await cache.get<ReviewState>(STATE_KEY)) ?? empty();
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
  async function flush() {
    const owner = cache.account();
    assertOwner(owner);
    let data = await state();
    while (data.pending.length) {
      const event = data.pending[0]!;
      let remote: Card | null = null;
      try {
        try {
          remote = await api.reviewCard(event.cardId, event.rating, {
            expectedReviews: event.expectedReviews,
            reviewedAt: event.reviewedAt,
          });
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'invalid_review') throw error;
          // A device clock may be ahead. Preserve replay protection but let the server choose
          // the review time when the supplied time is outside its accepted history.
          remote = await api.reviewCard(event.cardId, event.rating, {
            expectedReviews: event.expectedReviews,
          });
        }
      } catch (error) {
        assertOwner(owner);
        if (networkFailure(error)) return;
        if (!(error instanceof ApiError) || !['conflict', 'not_found'].includes(error.code))
          throw error;
        // A conflict can mean the previous response was lost, or another device won. In both
        // cases the server's current revision is authoritative; never blindly replay a rating.
        if (error.code === 'conflict') remote = await api.getCard(event.cardId);
      }
      assertOwner(owner);
      data.pending.shift();
      if (remote) {
        data.pending = data.pending.filter(
          (item) => item.cardId !== event.cardId || item.expectedReviews >= remote!.reviews,
        );
        if (!data.pending.some((item) => item.cardId === event.cardId))
          data.cards[event.cardId] = remote;
      } else {
        delete data.cards[event.cardId];
        data.pending = data.pending.filter((item) => item.cardId !== event.cardId);
      }
      await cache.put(STATE_KEY, data);
      data = await state();
    }
  }
  return {
    ...api,
    syncReviews: () => serial(flush),
    pendingReviews: async () => (await state()).pending.length,
    getCards: (page?: Parameters<T['getCards']>[0]) =>
      cached(`deck:${JSON.stringify(page ?? {})}`, () => api.getCards(page)),
    getConversations: (page?: Parameters<T['getConversations']>[0]) =>
      cached(`library:${JSON.stringify(page ?? {})}`, () => api.getConversations(page)),
    getRecordingTiming: (id: string, index: number) =>
      cached(`timing:${id}:${index}`, () => api.getRecordingTiming(id, index)),
    getConversation: (id: string) => cached(`transcript:${id}`, () => api.getConversation(id)),
    getCard: (id: string) => cached(`card:${id}`, () => api.getCard(id)),
    getDueCards: (limit?: number): Promise<ReviewQueue> =>
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
          const data = await state();
          if (!data.language) throw error;
          const cards = Object.values(data.cards)
            .filter((card) => Date.parse(card.dueAt) <= now())
            .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
          return {
            language: data.language,
            due: cards.length,
            cards: cards.slice(0, limit).map((card) => ({
              card,
              dueIn: Object.fromEntries(
                RATINGS.map((rating) => [
                  rating,
                  (Date.parse(reviewed(card, rating, now()).dueAt) - now()) / 1000,
                ]),
              ) as ReviewQueue['cards'][number]['dueIn'],
            })),
          };
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
        data.pending.push({
          cardId: id,
          rating,
          expectedReviews: before.reviews,
          reviewedAt: new Date(at).toISOString(),
        });
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
            rejected.pending = rejected.pending.filter(
              (event) => !(event.cardId === id && event.expectedReviews === before.reviews),
            );
            rejected.cards[id] = before;
            await cache.put(STATE_KEY, rejected);
          }
          throw error;
        }
        assertOwner(owner);
        return (await state()).cards[id] ?? after;
      }),
  };
}
