import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Face ID, Touch ID or the Android equivalent, used to let a signed-in user back in without
 * typing a password. Fails soft: any failure means "not available" or "not confirmed", and the
 * password is always the alternative.
 */

/** What to call the method on this device. Android picks its own, so it gets the general name. */
export type BiometricKind = 'faceId' | 'touchId' | 'biometrics';

/** The method this device offers, or null when it has none or the user has not set one up. */
export async function availableBiometrics(): Promise<BiometricKind | null> {
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    if (!hardware || !enrolled) return null;
    if (Platform.OS !== 'ios') return 'biometrics';
    return types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? 'faceId'
      : 'touchId';
  } catch {
    return null;
  }
}

/** Shows the system prompt with `promptMessage` and reports whether the user confirmed. */
export async function confirmWithBiometrics(promptMessage: string): Promise<boolean> {
  try {
    return (await LocalAuthentication.authenticateAsync({ promptMessage })).success;
  } catch {
    return false;
  }
}
