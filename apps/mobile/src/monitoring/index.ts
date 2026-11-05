import { scrubEvent } from './scrub';

/**
 * Crash reporting with Sentry (spec §6.21.4). Off unless `EXPO_PUBLIC_SENTRY_DSN` is set: a DSN
 * is an ingest-only key that ships inside the app, so it is not a secret. Sentry is loaded only
 * then, so a build without a DSN carries no reporting code path at all at run time.
 *
 * No learner data: no account or user id (the app does not name the learner to Sentry), no
 * breadcrumbs, no screenshots or view hierarchies, no sessions, no performance traces, and
 * `scrubEvent` drops requests and replaces every free-text message.
 *
 * Limit: `beforeSend` runs on JavaScript errors. A crash in native code is captured and sent by the
 * native SDK on the next launch, without it; the native options below keep scope text out of it,
 * but a native crash's own reason string (an exception message) is not scrubbed by this code.
 */

type SentryModule = typeof import('@sentry/react-native');

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

let sentry: SentryModule | null = null;

/** Starts crash reporting if this build has a DSN. Call once, before anything renders. */
export function initMonitoring(): void {
  if (!DSN || sentry) return;
  // Loaded here, not at the top, so Jest and builds without a DSN never touch the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require('@sentry/react-native') as SentryModule;
  loaded.init({
    dsn: DSN,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableAutoSessionTracking: false,
    tracesSampleRate: 0,
    // Native side (iOS and Android): the SDK reads these options itself, so the rules above hold
    // there too. Features that add text from the phone to a report are off: the NDK scope copy
    // (breadcrumbs and tags), app hangs, watchdog terminations and failed network requests.
    enableNdkScopeSync: false,
    enableAppHangTracking: false,
    enableWatchdogTerminationTracking: false,
    enableCaptureFailedRequests: false,
    enableUserInteractionTracing: false,
    enableAutoPerformanceTracing: false,
    beforeBreadcrumb: () => null,
    beforeSend: (event) => scrubEvent(event),
  });
  sentry = loaded;
}

/** Reports an error the app caught itself (a screen that broke), if reporting is on. */
export function reportError(error: unknown): void {
  sentry?.captureException(error);
}

/** Wraps the root component so a crash in native code or the JS runtime is reported. */
export function monitored(root: () => React.JSX.Element | null): () => React.JSX.Element | null {
  return sentry ? (sentry.wrap(root) as typeof root) : root;
}
