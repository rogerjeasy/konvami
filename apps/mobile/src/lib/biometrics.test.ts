import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { availableBiometrics, confirmWithBiometrics } from './biometrics';

beforeEach(() => jest.clearAllMocks());

describe('biometrics', () => {
  const device = (hardware: boolean, enrolled: boolean, types: number[]) => {
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValueOnce(hardware);
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValueOnce(enrolled);
    jest.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValueOnce(types);
  };
  const { FINGERPRINT, FACIAL_RECOGNITION } = LocalAuthentication.AuthenticationType;

  it('has none on a device without the hardware', async () => {
    device(false, false, []);
    expect(await availableBiometrics()).toBeNull();
  });

  it('has none when the user has not set any up', async () => {
    device(true, false, [FACIAL_RECOGNITION]);
    expect(await availableBiometrics()).toBeNull();
  });

  it('names Face ID and Touch ID on an iPhone', async () => {
    Platform.OS = 'ios';
    device(true, true, [FACIAL_RECOGNITION]);
    expect(await availableBiometrics()).toBe('faceId');
    device(true, true, [FINGERPRINT]);
    expect(await availableBiometrics()).toBe('touchId');
  });

  it('uses the general name on Android, where the phone picks the method', async () => {
    Platform.OS = 'android';
    device(true, true, [FINGERPRINT, FACIAL_RECOGNITION]);
    expect(await availableBiometrics()).toBe('biometrics');
    Platform.OS = 'ios';
  });

  it('has none when the check itself fails', async () => {
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockRejectedValueOnce(new Error('x'));
    expect(await availableBiometrics()).toBeNull();
  });

  it('reports whether the user confirmed, showing the given reason', async () => {
    expect(await confirmWithBiometrics('Unlock Konvami')).toBe(true);
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Unlock Konvami' }),
    );
    jest
      .mocked(LocalAuthentication.authenticateAsync)
      .mockResolvedValueOnce({ success: false, error: 'user_cancel' } as never);
    expect(await confirmWithBiometrics('Unlock Konvami')).toBe(false);
  });

  it('counts a failed prompt as not confirmed', async () => {
    jest.mocked(LocalAuthentication.authenticateAsync).mockRejectedValueOnce(new Error('x'));
    expect(await confirmWithBiometrics('Unlock Konvami')).toBe(false);
  });
});
