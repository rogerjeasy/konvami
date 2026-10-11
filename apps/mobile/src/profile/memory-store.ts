import type {
  ApiClient,
  Memories,
  Memory,
  MemoryChange,
  MemorySettings,
} from '@konvami/api-client';
import {
  createResourceStore,
  type ResourceState,
  type ResourceStore,
} from '@/practice/resource-store';

/**
 * What the learner's partners know about them (spec §6.11), as the "What my partners know"
 * screen shows it: every memory, whether memory is on, and the topics to leave alone. Every
 * change goes to the server first, so the store never shows one that was not saved.
 */
export type MemoryState = ResourceState<Memories>;

export interface MemoryStore extends ResourceStore<Memories> {
  /** Turns memory on or off, or sets the topics to leave alone. Rejects with an `ApiError`. */
  configure(settings: MemorySettings): Promise<void>;
  /** Rewords a memory or changes its day. Rejects with an `ApiError` (`duplicate`, …). */
  change(id: string, change: MemoryChange): Promise<Memory>;
  /** Forgets a memory for good. Rejects with an `ApiError`. */
  remove(id: string): Promise<void>;
}

export function createMemoryStore(
  api: Pick<ApiClient, 'getMemories' | 'configureMemories' | 'changeMemory' | 'removeMemory'>,
  /** Milliseconds since the epoch. */
  now: () => number,
): MemoryStore {
  const store = createResourceStore(() => api.getMemories(), now);
  return {
    ...store,
    async configure(settings) {
      await store.mutate(
        () => api.configureMemories(settings),
        (_, book) => book,
      );
    },
    change: (id, change) =>
      store.mutate(
        () => api.changeMemory(id, change),
        (book, changed) => ({
          ...book,
          memories: book.memories.map((memory) => (memory.id === id ? changed : memory)),
        }),
      ),
    async remove(id) {
      await store.mutate(
        () => api.removeMemory(id),
        (_, book) => book,
      );
    },
  };
}
