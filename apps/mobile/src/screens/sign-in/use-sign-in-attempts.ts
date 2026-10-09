import { useCallback, useEffect, useState } from 'react';
import {
  afterFailedSignIn,
  NO_ATTEMPTS,
  parseAttempts,
  pauseRemainingMs,
  triesLeft,
  type SignInAttempts,
} from '@/auth/attempts';
import { readItem, removeItem, writeItem } from '@/lib/storage';

// Saved on the device so closing the app does not end a pause. It holds two numbers, no user data.
const KEY = 'konvami.signin.attempts';

/**
 * Wrong-password counting for the sign-in screen: how many tries are left, and the pause after the
 * last one (see `@/auth/attempts`).
 */
export function useSignInAttempts() {
  const [attempts, setAttempts] = useState<SignInAttempts>(NO_ATTEMPTS);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let current = true;
    void readItem(KEY).then((stored) => {
      if (current && stored) setAttempts(parseAttempts(stored));
    });
    return () => {
      current = false;
    };
  }, []);

  const secondsLeft = Math.ceil(pauseRemainingMs(attempts, now) / 1000);
  const paused = secondsLeft > 0;
  useEffect(() => {
    if (!paused) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [paused]);

  /** Counts one wrong password and returns how many tries are left (0 starts the pause). */
  const recordFailure = useCallback((): number => {
    const next = afterFailedSignIn(attempts, Date.now());
    setNow(Date.now());
    setAttempts(next);
    void writeItem(KEY, JSON.stringify(next));
    return triesLeft(next);
  }, [attempts]);

  /** Forgets earlier wrong passwords (after a successful sign-in). */
  const clear = useCallback(() => {
    setAttempts(NO_ATTEMPTS);
    void removeItem(KEY);
  }, []);

  return { paused, secondsLeft, recordFailure, clear };
}
