import { api } from '@/api';
import { createClipPlayer } from '@/lib/clip-player';
import { deviceTimeZone } from '@/lib/time-zone';
import { createPracticeServices } from './services';

export * from './services';
export type { DeckState, DeckStore } from './deck-store';
export type { HomeState, HomeStore } from './home-store';
export type { LibraryState, LibraryStore } from './library-store';
export type { ReportFollower, ReportView } from './report-follower';
export type { ReviewItem, ReviewSession, ReviewState } from './review-session';

/** The app's practice services, on the real API, the device's own clock and audio player. */
export const practiceServices = createPracticeServices(
  api,
  { timeZone: deviceTimeZone, now: Date.now },
  createClipPlayer(),
);
