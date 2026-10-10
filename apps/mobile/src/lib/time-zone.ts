/**
 * The time zone the device is set to, as an IANA name ("Europe/Zurich"), or undefined when it
 * cannot say. The server cuts practice into days with it, so a streak follows the learner's
 * calendar; without it the server counts days in UTC.
 */
export function deviceTimeZone(): string | undefined {
  try {
    const { timeZone } = new Intl.DateTimeFormat().resolvedOptions();
    return typeof timeZone === 'string' && timeZone ? timeZone : undefined;
  } catch {
    return undefined;
  }
}
