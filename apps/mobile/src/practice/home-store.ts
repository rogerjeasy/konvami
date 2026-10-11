import type { ApiClient, Home } from '@konvami/api-client';
import { createResourceStore, type ResourceState, type ResourceStore } from './resource-store';

export { STALE_AFTER_MS } from './resource-store';

/**
 * What the Today and Talk screens show, read from the server in one answer. Screens read the
 * store; after a conversation, or when the app has been away for a while, it is read again
 * while the screen keeps showing what it had.
 */
export type HomeState = ResourceState<Home>;
export type HomeStore = ResourceStore<Home>;

export function createHomeStore(
  api: Pick<ApiClient, 'getHome'>,
  device: {
    /** The device's time zone, so days follow the learner's calendar. */
    timeZone: () => string | undefined;
    /** Milliseconds since the epoch. */
    now: () => number;
  },
): HomeStore {
  return createResourceStore(() => api.getHome(device.timeZone()), device.now);
}
