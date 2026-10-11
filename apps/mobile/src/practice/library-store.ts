import type { ApiClient, Conversation } from '@konvami/api-client';
import { createPagedStore, type PagedState, type PagedStore } from './paged-store';

/**
 * The learner's past conversations, newest first, read a page at a time as the list is scrolled.
 */
export type LibraryState = PagedState<Conversation>;
export type LibraryStore = PagedStore<Conversation>;

/** Conversations per request: a few screens' worth. */
export const PAGE_SIZE = 20;

export function createLibraryStore(api: Pick<ApiClient, 'getConversations'>): LibraryStore {
  return createPagedStore(async (before) => {
    const page = await api.getConversations({ before, limit: PAGE_SIZE });
    return { items: page.conversations, next: page.next, summary: null };
  });
}
