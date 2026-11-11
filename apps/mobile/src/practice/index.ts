import { deviceImportDocuments } from '@/imports/device-documents';
import { createLibraryTools } from '@/offline/library';
import { deviceLibraryMedia } from '@/offline/device-media';
import { authServices } from '@/auth';
import { createOfflineCache } from '@/offline/cache';
import { createOfflineApi } from '@/offline/api';
import { deviceOfflineDisk } from '@/offline/device-disk';
import { api } from '@/api';
import { deviceImportPhotos } from '@/imports/device-photos';
import { createClipPlayer } from '@/lib/clip-player';
import { deviceTimeZone } from '@/lib/time-zone';
import { createPracticeServices } from './services';

export * from './services';
export type { DeckState, DeckStore } from './deck-store';
export type { HomeState, HomeStore } from './home-store';
export type { LibraryState, LibraryStore } from './library-store';
export type { ReportFollower, ReportView } from './report-follower';
export type { ReviewItem, ReviewSession, ReviewState } from './review-session';

const offlineCache = createOfflineCache(
  deviceOfflineDisk,
  () => authServices.session.getState().user?.email ?? null,
);
export const offlineApi = createOfflineApi(api, offlineCache, Date.now);
// Delete personal device data while the old account identity is still available.
const libraryTools = createLibraryTools(offlineCache, deviceLibraryMedia, api);
export const clearOfflineRecordings = () => libraryTools.clearRecordings();
export const clearOfflineAccount = () => libraryTools.clear();
authServices.session.beforeSignOut(async () => {
  await offlineApi.syncReviews();
  if (await offlineApi.pendingReviews()) return;
  await clearOfflineAccount();
});

/** The app's practice services, on the real API, the device's own clock and audio player. */
export const practiceServices = createPracticeServices(
  offlineApi,
  { timeZone: deviceTimeZone, now: Date.now },
  createClipPlayer(),
  deviceImportPhotos,
  { offline: offlineApi, libraryTools, documents: deviceImportDocuments },
);
