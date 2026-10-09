import { api } from '@/api';
import { createOnboardingStore } from './store';

export * from './essentials';
export * from './routing';
export * from './services';
export type { OnboardingData, OnboardingState, OnboardingStore } from './store';

/** The app's onboarding store, on the real API. */
export const onboardingStore = createOnboardingStore(api);
