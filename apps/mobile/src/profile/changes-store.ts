import type { ApiClient, ProfileChanges } from '@konvami/api-client';
import {
  createResourceStore,
  type ResourceState,
  type ResourceStore,
} from '@/practice/resource-store';

/**
 * What the learner's partners changed in their settings by voice (spec §6.1.3), as the list on
 * the Profile shows it, newest first. A change can be undone while nothing changed the same
 * setting since; the server says which.
 */
export type ChangesState = ResourceState<ProfileChanges>;

export interface ChangesStore extends ResourceStore<ProfileChanges> {
  /**
   * Puts a setting back to what it was. Rejects with an `ApiError` (`superseded` when the
   * setting changed again since, `not_found`), and then what is shown stays as it was.
   */
  undo(id: number): Promise<void>;
}

export function createChangesStore(
  api: Pick<ApiClient, 'getProfileChanges' | 'undoProfileChange'>,
  /** Milliseconds since the epoch. */
  now: () => number,
  /** Called after a change was undone, so what shows the setting reads it again. */
  onUndone: () => void,
): ChangesStore {
  const store = createResourceStore(() => api.getProfileChanges(), now);
  return {
    ...store,
    async undo(id) {
      await store.mutate(
        () => api.undoProfileChange(id),
        (_, changes) => changes,
      );
      onUndone();
    },
  };
}
