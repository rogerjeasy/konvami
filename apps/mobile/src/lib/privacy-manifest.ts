/**
 * The data types the iOS privacy manifest (PrivacyInfo.xcprivacy) declares. Crash reports,
 * usage counts and purchases are sent only by a build that has their key, so the build declares
 * them only then; the App Store label must match (docs/store/privacy-labels.md).
 */

/** The optional services a build may carry, by whether its public key is set. */
export interface OptionalServices {
  /** Sentry crash reports (`EXPO_PUBLIC_SENTRY_DSN`). */
  crashReports: boolean;
  /** PostHog usage counts (`EXPO_PUBLIC_POSTHOG_KEY`), sent only after the learner turns them on. */
  analytics: boolean;
  /** RevenueCat purchases (`EXPO_PUBLIC_REVENUECAT_*_KEY`). */
  purchases: boolean;
}

const PURPOSE = {
  appFunctionality: 'NSPrivacyCollectedDataTypePurposeAppFunctionality',
  analytics: 'NSPrivacyCollectedDataTypePurposeAnalytics',
} as const;

type Purpose = (typeof PURPOSE)[keyof typeof PURPOSE];

export interface CollectedDataType {
  NSPrivacyCollectedDataType: string;
  NSPrivacyCollectedDataTypeLinked: boolean;
  NSPrivacyCollectedDataTypeTracking: false;
  NSPrivacyCollectedDataTypePurposes: Purpose[];
}

/** Collected by every build, for the app itself, linked to the account. */
const ALWAYS = [
  'EmailAddress',
  'Name',
  'UserID',
  // The push token, with reminders on.
  'DeviceID',
  'PhotosorVideos',
  'AudioData',
  'OtherUserContent',
  // Age group, consent choices and the learning profile (level, goals, interests).
  'OtherDataTypes',
] as const;

function entry(type: string, purposes: Purpose[], linked = true): CollectedDataType {
  return {
    NSPrivacyCollectedDataType: `NSPrivacyCollectedDataType${type}`,
    NSPrivacyCollectedDataTypeLinked: linked,
    NSPrivacyCollectedDataTypeTracking: false,
    NSPrivacyCollectedDataTypePurposes: purposes,
  };
}

export function collectedDataTypes(services: OptionalServices): CollectedDataType[] {
  const types = ALWAYS.map((type) => entry(type, [PURPOSE.appFunctionality]));
  // Reviews, conversations and voice minutes; usage counts add analytics as a second purpose of
  // the same type (Apple lists each type once).
  types.push(
    entry(
      'ProductInteraction',
      services.analytics
        ? [PURPOSE.appFunctionality, PURPOSE.analytics]
        : [PURPOSE.appFunctionality],
    ),
  );
  // Crash reports carry no account (src/monitoring/scrub.ts), so they are not linked.
  if (services.crashReports) types.push(entry('CrashData', [PURPOSE.appFunctionality], false));
  if (services.purchases) types.push(entry('PurchaseHistory', [PURPOSE.appFunctionality]));
  return types;
}

/** Which optional services a build carries, from its environment. */
export function optionalServicesFrom(env: Record<string, string | undefined>): OptionalServices {
  const set = (name: string) => Boolean(env[name]?.trim());
  return {
    crashReports: set('EXPO_PUBLIC_SENTRY_DSN'),
    analytics: set('EXPO_PUBLIC_POSTHOG_KEY'),
    purchases: set('EXPO_PUBLIC_REVENUECAT_IOS_KEY'),
  };
}
