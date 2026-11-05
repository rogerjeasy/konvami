import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getPreferences } from '@/preferences';
import { readItem, removeItem, writeItem } from '@/lib/storage';
import { createPostHog, readAnalyticsConfig, type Analytics, type AnalyticsEvent } from './posthog';

export type { AnalyticsEvent } from './posthog';

const INSTALL_ID_KEY = 'konvami.analytics.id';
const config = readAnalyticsConfig({
  key: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
});

/** Whether this build can send analytics at all: a key is set. The Privacy screen hides its
 * switch otherwise. */
export const analyticsAvailable = config !== null;

/** A random id for this install. Not an account id, and not a security token. */
function randomId(): string {
  const crypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, '0'),
  ).join('');
}

let pending: Promise<string> | null = null;

/** The install id, made the first time an event is sent after the learner agreed. */
function installId(): Promise<string> {
  pending ??= readItem(INSTALL_ID_KEY).then(async (saved) => {
    if (saved) return saved;
    const made = randomId();
    await writeItem(INSTALL_ID_KEY, made);
    return made;
  });
  return pending;
}

/** Forgets the install id, as the learner withdraws: a later "yes" starts a new, unrelated one. */
export async function forgetAnalyticsId(): Promise<void> {
  pending = null;
  await removeItem(INSTALL_ID_KEY);
}

const posthog: Analytics | null = config
  ? createPostHog(config, installId, {
      appVersion: Constants.expoConfig?.version ?? 'unknown',
      platform: Platform.OS,
    })
  : null;

/**
 * Counts one event, if this build has analytics and the learner agreed (6.7 Privacy and AI,
 * off by default). Otherwise it does nothing, and nothing is stored.
 */
export function track(event: AnalyticsEvent, properties?: Record<string, string>): void {
  if (posthog && getPreferences().analytics) posthog.capture(event, properties);
}
