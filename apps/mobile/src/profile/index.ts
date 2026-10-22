import { api } from '@/api';
import { practiceServices } from '@/practice';
import { devicePictures } from './device-pictures';
import { createProfileServices } from './services';

export * from './services';
export type { AccountState, AccountStore } from './account-store';
export type { MemoryState, MemoryStore } from './memory-store';
export type { PartnersState, PartnersStore } from './partners-store';

/** The app's profile services, on the real API, photo picker and audio player. */
export const profileServices = createProfileServices(api, {
  pictures: devicePictures,
  // One player for the whole app: a sample and a recording never play over each other.
  samples: practiceServices.clips,
  onPartnersChanged: () => void practiceServices.home.refresh(),
});
