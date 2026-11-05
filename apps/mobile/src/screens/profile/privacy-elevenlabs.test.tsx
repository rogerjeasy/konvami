import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi } from '@/test/fake-api';
import { createTestAuth, renderScreen } from '@/test/render';
import { PrivacyScreen } from './privacy';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

async function open(options: { offered: boolean; agreedBefore?: 'v2' | 'v3' }) {
  const auth = await createTestAuth();
  const api = createFakeApi();
  api.enterApp();
  api.premiumVoices({ offered: options.offered, voices: [{ id: 'Maya123', name: 'Maya' }] });
  await renderScreen(<PrivacyScreen />, { auth, api, signedIn: true });
  if (options.agreedBefore) {
    // Someone who agreed under an earlier consent text.
    await act(async () => {
      await auth.session.saveAiConsent({
        elevenlabs: options.agreedBefore === 'v3',
        bedrock: false,
      });
    });
  }
  await screen.findByRole('header', { name: 'Privacy and AI' });
  return { auth, api };
}

describe('6.7 Privacy and AI: ElevenLabs', () => {
  it('does not name ElevenLabs where the server does not offer it', async () => {
    await open({ offered: false });

    expect(screen.queryByText('ElevenLabs')).toBeNull();
    expect(screen.queryByText(/ElevenLabs can read/)).toBeNull();
  });

  it('names it as optional and off, with what it receives, and tells those who agreed before', async () => {
    await open({ offered: true });

    expect(await screen.findByRole('switch', { name: 'ElevenLabs, off' })).not.toBeChecked();
    expect(screen.getByText('Receives: the text to read aloud · never your voice')).toBeTruthy();
    expect(screen.getByText(/New: ElevenLabs can read your cards/)).toBeTruthy();
    // OpenAI stays required whatever is chosen here.
    expect(screen.getByRole('switch', { name: 'OpenAI, required' })).toBeDisabled();
  });

  it('writes the agreement to the account when the switch is turned on, and can take it back', async () => {
    const { auth, api } = await open({ offered: true });

    await fireEvent.press(await screen.findByRole('switch', { name: 'ElevenLabs, off' }));

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'ElevenLabs, optional' })).toBeChecked(),
    );
    expect(auth.session.getState().user?.aiConsent).toMatchObject({
      version: 'v3',
      providers: { elevenlabs: true },
    });
    // The server's view is read again, because it reads the consent from the account.
    expect(api.calls.filter(([method]) => method === 'getPremiumVoices').length).toBeGreaterThan(1);

    await fireEvent.press(screen.getByRole('switch', { name: 'ElevenLabs, optional' }));
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'ElevenLabs, off' })).not.toBeChecked(),
    );
    expect(auth.session.getState().user?.aiConsent?.providers.elevenlabs).toBe(false);
  });

  it('does not tell someone who has seen the consent text that ElevenLabs is new', async () => {
    await open({ offered: true, agreedBefore: 'v3' });

    expect(screen.queryByText(/New: ElevenLabs can read/)).toBeNull();
  });

  it('shows the failure and leaves the switch off when the agreement could not be saved', async () => {
    const { auth } = await open({ offered: true });
    auth.provider.failNext('saveAiConsent', 'network');

    await fireEvent.press(await screen.findByRole('switch', { name: 'ElevenLabs, off' }));

    expect(
      await screen.findByText('Can’t reach Konvami. Check your connection and try again.'),
    ).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'ElevenLabs, off' })).not.toBeChecked();
  });
});
