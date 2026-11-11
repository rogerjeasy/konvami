import type { ApiClient, Conversation } from '@konvami/api-client';
import { createPagedStore, type PagedState, type PagedStore } from './paged-store';

/**
 * The learner's past conversations, newest first, read a page at a time as the list is scrolled.
 */
export type LibraryState = PagedState<Conversation>;
export type LibraryQuery = Omit<
  NonNullable<Parameters<ApiClient['getConversations']>[0]>,
  'before' | 'limit'
>;
export interface LibraryStore extends PagedStore<Conversation> {
  search(query: LibraryQuery): Promise<void>;
}

/** Conversations per request: a few screens' worth. */
export const PAGE_SIZE = 20;

export function createLibraryStore(api: Pick<ApiClient, 'getConversations'>): LibraryStore {
  let query: LibraryQuery = {};
  const store = createPagedStore<Conversation>(async (before) => {
    const page = await api.getConversations({ before, limit: PAGE_SIZE, ...query });
    return { items: page.conversations, next: page.next, summary: null };
  });
  return {
    ...store,
    async search(next) {
      query = next;
      store.reset();
      await store.reload();
    },
  };
}
