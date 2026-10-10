import { api } from '@/api';
import { deviceTimeZone } from '@/lib/time-zone';
import { createPracticeServices } from './services';

export * from './services';
export type { HomeState, HomeStore } from './home-store';
export type { LibraryState, LibraryStore } from './library-store';

/** The app's practice services, on the real API and the device's own clock. */
export const practiceServices = createPracticeServices(api, {
  timeZone: deviceTimeZone,
  now: Date.now,
});
