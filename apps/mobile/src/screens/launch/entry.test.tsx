import { act, screen } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { motion } from '@konvami/design-tokens';
import { createTestAuth, renderScreen } from '@/test/render';
import { LaunchEntry } from './entry';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

const EMAIL = 'amara@mail.com';
const PASSWORD = 'Sommer2026!';

async function afterBrandMoment() {
  await act(async () => void jest.advanceTimersByTime(motion.brandMoment));
}

beforeEach(() => {
  (SecureStore as unknown as { __reset: () => void }).__reset();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  // Back to a device without biometrics, whatever a test set up (and did or did not use).
  jest.mocked(LocalAuthentication.hasHardwareAsync).mockReset().mockResolvedValue(false);
  jest.mocked(LocalAuthentication.isEnrolledAsync).mockReset().mockResolvedValue(false);
  jest
    .mocked(LocalAuthentication.supportedAuthenticationTypesAsync)
    .mockReset()
    .mockResolvedValue([]);
});

describe('LaunchEntry', () => {
  it('shows the brand moment, then the intro, to someone who is not signed in', async () => {
    await renderScreen(<LaunchEntry />);
    expect(screen.queryByText(/redirect:/)).toBeNull();
    await afterBrandMoment();
    expect(screen.getByText('redirect:/intro')).toBeTruthy();
  });

  it('takes a signed-in user who has not agreed to the AI consent straight back to it', async () => {
    const auth = await createTestAuth();
    auth.provider.addAccount(EMAIL, PASSWORD);
    await auth.session.signIn(EMAIL, PASSWORD);

    await renderScreen(<LaunchEntry />, { auth });
    await afterBrandMoment();
    expect(screen.getByText('redirect:/ai-consent')).toBeTruthy();
  });

  it('asks a signed-in user to unlock first on a phone with Face ID set up', async () => {
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValueOnce(true);
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValueOnce(true);
    jest
      .mocked(LocalAuthentication.supportedAuthenticationTypesAsync)
      .mockResolvedValueOnce([LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]);
    const auth = await createTestAuth();
    auth.provider.addAccount(EMAIL, PASSWORD);
    await auth.session.signIn(EMAIL, PASSWORD);

    await renderScreen(<LaunchEntry />, { auth });
    await afterBrandMoment();
    expect(screen.getByText('redirect:/welcome-back')).toBeTruthy();
  });

  it('never asks someone who is not signed in to unlock', async () => {
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValueOnce(true);
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValueOnce(true);
    await renderScreen(<LaunchEntry />);
    await afterBrandMoment();
    expect(screen.getByText('redirect:/intro')).toBeTruthy();
  });

  it('takes a signed-in user who has agreed into the app', async () => {
    const auth = await createTestAuth();
    auth.provider.addAccount(EMAIL, PASSWORD);
    await auth.session.signIn(EMAIL, PASSWORD);
    await auth.session.saveAiConsent({ elevenlabs: true, bedrock: true });

    await renderScreen(<LaunchEntry />, { auth });
    await afterBrandMoment();
    expect(screen.getByText('redirect:/home')).toBeTruthy();
  });
});
