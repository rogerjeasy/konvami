import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { createFakeProfileDevice } from '@/test/fake-profile-device';
import { createTestAuth, renderScreen } from '@/test/render';
import { ReadAloudScreen } from './read-aloud';

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

const MAYA = { id: 'Maya123', name: 'Maya' };
const OTTO = { id: 'Otto456', name: 'Otto' };

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

async function open(
  api: FakeApi,
  options: { auth?: Awaited<ReturnType<typeof createTestAuth>> } = {},
) {
  const device = createFakeProfileDevice();
  await renderScreen(<ReadAloudScreen />, { api, device, signedIn: true, ...options });
  return { api, device };
}

describe('6.22 Read-aloud voice', () => {
  it('goes back to the Profile where ElevenLabs is not set up', async () => {
    await open(inApp());

    expect(await screen.findByText('redirect:/account')).toBeTruthy();
  });

  it('asks for the learner’s agreement first, naming what ElevenLabs receives', async () => {
    const auth = await createTestAuth();
    const api = inApp();
    // The server reads the agreement from the account, as the real one does.
    api.premiumVoices({
      offered: true,
      voices: [MAYA, OTTO],
      consent: () =>
        auth.provider.calls.some(
          ([method, , choices]) =>
            method === 'saveAiConsent' && (choices as { elevenlabs: boolean }).elevenlabs,
        ),
    });
    await open(api, { auth });

    expect(await screen.findByRole('header', { name: 'Turn on ElevenLabs' })).toBeTruthy();
    expect(screen.getByText(/It receives only that text, never your voice/)).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Maya' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Agree and turn on' }));

    // The agreement is written to the account with ElevenLabs on, and the voices appear.
    expect(await screen.findByRole('radio', { name: 'Maya' })).toBeTruthy();
    expect(auth.provider.calls).toContainEqual([
      'saveAiConsent',
      expect.any(String),
      { elevenlabs: true, bedrock: false },
    ]);
  });

  it('lists the standard voice and the premium ones, the standard one chosen first', async () => {
    const api = inApp();
    api.premiumVoices({ offered: true, consent: true, voices: [MAYA, OTTO] });
    await open(api);

    expect(await screen.findByRole('radio', { name: /Standard voice/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Maya' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Otto' })).not.toBeChecked();
  });

  it('keeps the voice the learner picks, and lets them go back to the standard one', async () => {
    const api = inApp();
    api.premiumVoices({ offered: true, consent: true, voices: [MAYA, OTTO] });
    await open(api);

    await fireEvent.press(await screen.findByRole('radio', { name: 'Otto' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Otto' })).toBeChecked());
    expect(api.calls).toContainEqual(['choosePremiumVoice', 'Otto456']);

    await fireEvent.press(screen.getByRole('radio', { name: /Standard voice/ }));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Standard voice/ })).toBeChecked(),
    );
    expect(api.calls).toContainEqual(['choosePremiumVoice', null]);
  });

  it('plays a sample and stops it again', async () => {
    const api = inApp();
    api.premiumVoices({ offered: true, consent: true, voices: [MAYA] });
    const { device } = await open(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'Play a sample of Maya' }));

    await waitFor(() =>
      expect(device.playing).toBe('https://files.test/voices/premium/de/Maya123.mp3'),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Stop the sample of Maya' }));
    await act(async () => device.finishClip());
    expect(device.playing).toBeNull();
  });

  it('says so when a sample cannot be played, and still lets the voice be chosen', async () => {
    const api = inApp();
    api.premiumVoices({ offered: true, consent: true, voices: [MAYA] });
    await open(api);
    api.failNext('getPremiumVoiceSample', 'voice_unavailable');

    await fireEvent.press(await screen.findByRole('button', { name: 'Play a sample of Maya' }));

    expect(await screen.findByText(/This sample can’t be played right now/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Maya' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Maya' })).toBeChecked());
  });

  it('says premium voices are not part of the plan where the learner may not use them', async () => {
    const api = inApp();
    api.premiumVoices({ offered: true, consent: true, allowed: false, voices: [MAYA] });
    await open(api);

    expect(await screen.findByText('Premium voices aren’t part of your plan.')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Maya' })).toBeNull();
  });

  it('can be tried again when the voices cannot be read', async () => {
    const api = inApp();
    api.premiumVoices({ offered: true, consent: true, voices: [MAYA] });
    api.failNext('getPremiumVoices', 'network');
    await open(api);

    expect(await screen.findByText('Premium voices can’t be shown right now.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('radio', { name: 'Maya' })).toBeTruthy();
  });
});
