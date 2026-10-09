import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import { motion } from '@konvami/design-tokens';
import { routeForSession, useSession } from '@/auth';
import { availableBiometrics } from '@/lib/biometrics';
import { ROUTES } from '@/lib/routes';
import { LaunchScreen } from '.';

/**
 * App entry: the branded launch (1.1 Splash), then where this person belongs.
 * - Not signed in: the intro (1.2–1.4) and Welcome (1.5).
 * - Signed in, on a phone with Face ID or similar set up: 3.3 Welcome back, to unlock.
 * - Signed in otherwise: straight into the app (or to the AI consent they have not finished).
 */
export function LaunchEntry() {
  const reduced = useReducedMotion();
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const [brandMomentDone, setBrandMomentDone] = useState(false);
  /** Whether to ask for an unlock; `undefined` while the device is being asked. */
  const [lock, setLock] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    // With Reduce Motion the splash has nothing to play, so it only stays long enough to read.
    const timer = setTimeout(
      () => setBrandMomentDone(true),
      reduced ? motion.brandMoment / 2 : motion.brandMoment,
    );
    return () => clearTimeout(timer);
  }, [reduced]);

  // Asked during the brand moment, so it costs no extra waiting.
  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    void availableBiometrics().then((kind) => {
      if (current) setLock(kind !== null);
    });
    return () => {
      current = false;
    };
  }, [signedIn]);

  // The saved session is restored before the first screen (root layout), so it is never "loading" here.
  if (!brandMomentDone) return <LaunchScreen />;
  if (!signedIn) return <Redirect href={ROUTES.intro} />;
  if (lock === undefined) return <LaunchScreen />;
  return <Redirect href={lock ? ROUTES.welcomeBack : routeForSession(session)} />;
}
