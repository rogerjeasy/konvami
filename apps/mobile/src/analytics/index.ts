import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getPreferences } from '@/preferences';
import { installId } from './install-id';
import { createPostHog, readAnalyticsConfig, type Analytics, type AnalyticsEvent } from './posthog';

export type { AnalyticsEvent } from './posthog';
export { forgetAnalyticsId } from './install-id';

const config = readAnalyticsConfig({
  key: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
});

/** Whether this build can send analytics at all: a key is set. The Privacy screen hides its
 * switch otherwise. */
export const analyticsAvailable = config !== null;

const posthog: Analytics | null = config
  ? createPostHog(
      config,
      // Asked for again when an event is about to leave: an event queued just before the learner
      // withdrew is dropped here, and no id is made for it.
      () =>
        getPreferences().analytics
          ? installId()
          : Promise.reject(new Error('Usage counts are off.')),
      {
        appVersion: Constants.expoConfig?.version ?? 'unknown',
        platform: Platform.OS,
      },
    )
  : null;

/**
 * Counts one event, if this build has analytics and the learner agreed (6.7 Privacy and AI,
 * off by default). Otherwise it does nothing, and nothing is stored.
 */
export function track(event: AnalyticsEvent, properties?: Record<string, string>): void {
  if (posthog && getPreferences().analytics) posthog.capture(event, properties);
}
