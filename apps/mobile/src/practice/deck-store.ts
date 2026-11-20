import type { ApiClient, Card, DeckSummary } from '@konvami/api-client';
import { createPagedStore, type PagedState, type PagedStore } from './paged-store';

/** How many cards there are and are due, and whether they are scheduled with the learner's
 * own fitted parameters. */
export type DeckTotals = DeckSummary & { tuned: boolean };

/**
 * The learner's flashcards, newest first, with how many there are and how many are due. Read a
 * page at a time; read again after a card was saved, reviewed or removed.
 */
export type DeckState = PagedState<Card, DeckTotals>;

export interface DeckStore extends PagedStore<Card, DeckTotals> {
  /** Removes a card, then reads the deck again. Rejects with the `ApiError` when it could not. */
  remove(id: string): Promise<void>;
}

/** Cards per request: as many as a learner scrolls through in one go. */
export const PAGE_SIZE = 50;

export function createDeckStore(api: Pick<ApiClient, 'getCards' | 'removeCard'>): DeckStore {
  const store = createPagedStore<Card, DeckTotals>(async (before) => {
    const { cards, next, total, due, scheduleTuned } = await api.getCards({
      before,
      limit: PAGE_SIZE,
    });
    return { items: cards, next, summary: { total, due, tuned: scheduleTuned } };
  });
  return {
    ...store,
    async remove(id) {
      await api.removeCard(id);
      await store.refresh();
    },
  };
}
