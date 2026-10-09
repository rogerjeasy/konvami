/**
 * A device-side limit on wrong passwords, so the sign-in screen can say truthfully how many tries
 * are left and when the next one is possible. It is a courtesy and a speed bump, not the defence:
 * the service applies its own lockout to the account whatever this device does.
 */

/** Wrong passwords allowed in a row before sign-in pauses on this device. */
export const MAX_SIGN_IN_TRIES = 5;
/** Length of the pause (minutes). */
export const SIGN_IN_PAUSE_MINUTES = 5;

const PAUSE_MS = SIGN_IN_PAUSE_MINUTES * 60 * 1000;

export interface SignInAttempts {
  /** Wrong passwords since the last success or pause. */
  failures: number;
  /** When sign-in is possible again (ms since epoch), or null when it is not paused. */
  pausedUntil: number | null;
}

export const NO_ATTEMPTS: SignInAttempts = { failures: 0, pausedUntil: null };

/** Milliseconds until sign-in is possible again; 0 when it is not paused. */
export function pauseRemainingMs(attempts: SignInAttempts, now: number): number {
  return attempts.pausedUntil === null ? 0 : Math.max(attempts.pausedUntil - now, 0);
}

export function triesLeft(attempts: SignInAttempts): number {
  return Math.max(MAX_SIGN_IN_TRIES - attempts.failures, 0);
}

/** The state after one more wrong password at `now`. */
export function afterFailedSignIn(attempts: SignInAttempts, now: number): SignInAttempts {
  // A pause that has run out wipes the slate: counting starts again.
  const failures = (attempts.pausedUntil === null ? attempts.failures : 0) + 1;
  return failures >= MAX_SIGN_IN_TRIES
    ? { failures, pausedUntil: now + PAUSE_MS }
    : { failures, pausedUntil: null };
}

/** Reads the saved state; anything unreadable means no attempts (never a locked-out user). */
export function parseAttempts(stored: string | null): SignInAttempts {
  try {
    const value = JSON.parse(stored ?? '') as Partial<SignInAttempts> | null;
    const failures = value?.failures;
    const pausedUntil = value?.pausedUntil ?? null;
    if (typeof failures !== 'number' || !Number.isInteger(failures) || failures < 0) {
      return NO_ATTEMPTS;
    }
    if (pausedUntil !== null && typeof pausedUntil !== 'number') return NO_ATTEMPTS;
    return { failures, pausedUntil };
  } catch {
    return NO_ATTEMPTS;
  }
}
