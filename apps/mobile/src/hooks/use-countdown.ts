import { useCallback, useEffect, useState } from 'react';

/**
 * Seconds left until a moment in the future ("Resend code in 0:42"). It counts from a fixed end
 * time, not by subtracting a second per tick, so it is still right after the app was in the
 * background, where timers pause.
 */
export function useCountdown(seconds: number): {
  secondsLeft: number;
  /** Starts counting again from `seconds` (0 ends the wait at once). */
  restart: (seconds: number) => void;
} {
  const [endsAt, setEndsAt] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());

  const secondsLeft = Math.max(Math.ceil((endsAt - now) / 1000), 0);
  const running = secondsLeft > 0;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const restart = useCallback((next: number) => {
    setNow(Date.now());
    setEndsAt(Date.now() + next * 1000);
  }, []);

  return { secondsLeft, restart };
}
