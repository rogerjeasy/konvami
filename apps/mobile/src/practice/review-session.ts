import type { ApiClient, Card, Rating, ReviewCard } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';

/** A card in a sitting. `dueIn` is null for one that came back: its times have changed. */
export interface ReviewItem {
  card: Card;
  dueIn: ReviewCard['dueIn'] | null;
}

/**
 * One sitting of flashcard review: the cards that are due, one at a time. The learner looks at
 * a card, shows its answer and says how well they knew it; the server decides when it comes
 * back. A card that was not known comes back once more at the end of the sitting.
 */
export type ReviewState =
  | { phase: 'loading' }
  /** The cards could not be read; `code` says why (`network`, …). */
  | { phase: 'failed'; code: string }
  /** Nothing is due. */
  | { phase: 'empty' }
  | {
      phase: 'card';
      item: ReviewItem;
      /** The answer is showing. */
      revealed: boolean;
      /** Which card of the sitting this is, counted from 1, and how many there are. */
      position: number;
      total: number;
      /** The rating is on its way to the server. */
      saving: boolean;
      /** Why the last rating could not be stored; the card is still there to rate again. */
      error: string | null;
    }
  | { phase: 'done'; reviewed: number };

export interface ReviewSession {
  getState(): ReviewState;
  subscribe(listener: () => void): () => void;
  /** Reads the cards that are due and shows the first; called again, it starts over. Never throws. */
  start(): Promise<void>;
  /** Shows the answer of the card on screen. */
  reveal(): void;
  /** Stores how well the card was known and moves on. Does nothing until the answer shows. */
  rate(rating: Rating): Promise<void>;
}

/** How many cards one sitting holds: enough for a few minutes, never a chore. */
export const SESSION_SIZE = 20;
/** The card was reviewed or removed somewhere else meanwhile: nothing is left to do with it. */
const SETTLED_ELSEWHERE = ['conflict', 'not_found'];

export function createReviewSession(
  api: Pick<ApiClient, 'getDueCards' | 'reviewCard'>,
): ReviewSession {
  let state: ReviewState = { phase: 'loading' };
  let queue: ReviewItem[] = [];
  let total = 0;
  /** Cards that will not come back in this sitting. */
  let finished = 0;
  /** Raised by `start`, so the answer of an earlier start is dropped. */
  let run = 0;
  const listeners = new Set<() => void>();

  function setState(next: ReviewState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function showNext() {
    const item = queue.shift();
    if (!item) {
      setState({ phase: 'done', reviewed: total });
      return;
    }
    setState({
      phase: 'card',
      item,
      revealed: false,
      position: finished + 1,
      total,
      saving: false,
      error: null,
    });
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async start() {
      const from = (run += 1);
      if (state.phase !== 'loading') setState({ phase: 'loading' });
      try {
        const { cards } = await api.getDueCards(SESSION_SIZE);
        if (from !== run) return;
        queue = [...cards];
        total = cards.length;
        finished = 0;
        if (total === 0) setState({ phase: 'empty' });
        else showNext();
      } catch (error) {
        if (from === run) setState({ phase: 'failed', code: apiErrorCode(error) });
      }
    },

    reveal() {
      if (state.phase === 'card' && !state.revealed) setState({ ...state, revealed: true });
    },

    async rate(rating) {
      if (state.phase !== 'card' || !state.revealed || state.saving) return;
      const current = state;
      const from = run;
      setState({ ...current, saving: true, error: null });
      try {
        const card = await api.reviewCard(current.item.card.id, rating);
        if (from !== run) return;
        if (rating === 'again') queue.push({ card, dueIn: null });
        else finished += 1;
      } catch (error) {
        if (from !== run) return;
        const code = apiErrorCode(error);
        if (!SETTLED_ELSEWHERE.includes(code)) {
          setState({ ...current, saving: false, error: code });
          return;
        }
        finished += 1;
      }
      showNext();
    },
  };
}
