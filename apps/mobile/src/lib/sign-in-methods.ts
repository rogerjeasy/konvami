/**
 * Sign-in ways drawn on 2.2 Create account and 3.1 Sign in that are not connected yet: Apple and
 * Google need the developer accounts' credentials, the emailed sign-in link needs Amazon SES.
 *
 * Store builds hide them, because a button that only says "coming soon" is a placeholder that
 * App Review and Play review reject (docs/store/compliance.md §5). A development or preview build
 * can show them as designed, with that notice, by setting `EXPO_PUBLIC_SHOW_PENDING_SIGN_IN=true`.
 */
export function pendingSignInShownFrom(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export const SHOW_PENDING_SIGN_IN = pendingSignInShownFrom(
  process.env.EXPO_PUBLIC_SHOW_PENDING_SIGN_IN,
);

/** Whether the screens show the sign-in ways that are not connected yet. */
export function showsPendingSignIn(): boolean {
  return SHOW_PENDING_SIGN_IN;
}
