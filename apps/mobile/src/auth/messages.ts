import { AuthError, type AuthErrorCode } from './types';

/** Failures that read the same on every screen. Screen-specific ones (a wrong code) stay there. */
const GENERAL = {
  network: 'errors.network',
  tooManyAttempts: 'errors.tooManyAttempts',
  notConfigured: 'errors.notConfigured',
} as const satisfies Partial<Record<AuthErrorCode, string>>;

/** The code of anything thrown by an auth call; a non-auth error counts as `unknown`. */
export function authErrorCode(error: unknown): AuthErrorCode {
  return error instanceof AuthError ? error.code : 'unknown';
}

/** Translation key of the general message for a failure. */
export function generalErrorKey(code: AuthErrorCode) {
  return code in GENERAL ? GENERAL[code as keyof typeof GENERAL] : 'errors.unknown';
}
