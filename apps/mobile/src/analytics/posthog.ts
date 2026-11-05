/**
 * Product analytics (spec §6.21.4: privacy-friendly, EU-hosted, used only with consent).
 *
 * A small interface, so the provider can change, and one implementation: PostHog's capture API
 * over `fetch`. No SDK means no native module, no advertising identifier, no device fingerprint
 * and so no App Tracking Transparency prompt: an event carries the event name, the app version
 * and platform, and an install id that is random, made only after the learner agreed, and
 * forgotten when they withdraw. It is never linked to the account.
 */

/** Every event the app sends. Keep this list tiny: it is also what the privacy notice says. */
export type AnalyticsEvent = 'app_opened' | 'conversation_started' | 'feedback_sent';

export interface Analytics {
  /** Sends one event. Never throws and never waits: analytics must not slow the app down. */
  capture(event: AnalyticsEvent, properties?: Record<string, string>): void;
}

export interface AnalyticsConfig {
  /** The PostHog project's public key (it ships in the app, so it is not a secret). */
  key: string;
  /** The PostHog host: the EU cloud unless set otherwise. */
  host: string;
}

/** PostHog's EU cloud, so the data stays in the EU. */
export const DEFAULT_ANALYTICS_HOST = 'https://eu.i.posthog.com';

/**
 * The analytics settings from `EXPO_PUBLIC_POSTHOG_*`, or null when not configured. A host that
 * is not https is refused: events would travel in the clear.
 */
export function readAnalyticsConfig(env: { key?: string; host?: string }): AnalyticsConfig | null {
  const key = env.key?.trim();
  if (!key) return null;
  const host = (env.host?.trim() || DEFAULT_ANALYTICS_HOST).replace(/\/+$/, '');
  return host.startsWith('https://') ? { key, host } : null;
}

export interface PostHogContext {
  /** The app version and platform sent with every event. */
  appVersion: string;
  platform: string;
}

export function createPostHog(
  config: AnalyticsConfig,
  installId: () => Promise<string>,
  context: PostHogContext,
  send: typeof fetch = fetch,
): Analytics {
  return {
    capture(event, properties = {}) {
      void installId()
        .then((id) =>
          send(`${config.host}/capture/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: config.key,
              event,
              distinct_id: id,
              properties: {
                ...properties,
                app_version: context.appVersion,
                platform: context.platform,
                // No person profile and no library details: only counted events.
                $process_person_profile: false,
                $lib: 'konvami',
              },
            }),
          }),
        )
        .catch(() => {
          // Lost: an event is never worth a retry queue.
        });
    },
  };
}
