/**
 * Where a learner writes for help (spec §6.21.4). The address comes from the build
 * (`EXPO_PUBLIC_SUPPORT_EMAIL`), never from source; without one, the Help screen has no email row.
 */

// Enough to tell an address from a stray word; the mail app does the rest.
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The configured support address, or null when there is none or it is not an address. */
export function supportEmailFrom(value: string | undefined): string | null {
  const email = value?.trim();
  return email && ADDRESS.test(email) ? email : null;
}

export const SUPPORT_EMAIL = supportEmailFrom(process.env.EXPO_PUBLIC_SUPPORT_EMAIL);

/** A link that opens a new message to `email` in the phone's mail app. */
export function supportMailto(email: string, subject: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
