import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { useLocalSearchParams } from 'expo-router';
import { createFakeApi, FAKE_PERSONAS, type FakeApi } from '@/test/fake-api';
import { createFakeProfileDevice } from '@/test/fake-profile-device';
import { createFakeRecorder } from '@/test/fake-recorder';
import { renderScreen } from '@/test/render';
import { PenPalScreen } from '.';

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

const LENA = FAKE_PERSONAS[0]!.id;
const JONAS = FAKE_PERSONAS[1]!.id;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

async function open(api: FakeApi = inApp(), extra: Parameters<typeof renderScreen>[1] = {}) {
  await renderScreen(<PenPalScreen />, { api, signedIn: true, ...extra });
  await screen.findByRole('header', { name: 'Pen-pal' });
  await waitFor(() => expect(screen.queryByText('Opening your notes…')).toBeNull());
  return api;
}

describe('5.21 Pen-pal', () => {
  it('invites a first note, and says the partner writes once notes are on', async () => {
    await open();

    expect(await screen.findByText('No notes yet')).toBeTruthy();
    expect(
      screen.getByText(/Lena will write to you first once you turn notes on in the settings/),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record a voice note' })).toBeTruthy();
  });

  it('shows a partner’s note with its text, plays it, and reads it as opened', async () => {
    const api = inApp();
    api.penPalNotes(LENA, [{ text: 'Hallo! Wie war dein Wochenende?' }]);
    const device = createFakeProfileDevice();

    await open(api, { device });

    expect(await screen.findByText('Hallo! Wie war dein Wochenende?')).toBeTruthy();
    await waitFor(() => expect(api.calls).toContainEqual(['openPenPalThread', LENA]));
    await fireEvent.press(screen.getByRole('button', { name: 'Play the voice note' }));

    expect(device.playing).toBe('https://files.test/penpal/note.mp3');
    expect(screen.getByRole('button', { name: 'Stop the voice note' })).toBeTruthy();
  });

  it('opens the thread of the partner asked for', async () => {
    const api = inApp();
    api.penPalNotes(JONAS, [{ text: 'Guten Tag! Haben Sie Fragen?' }]);
    jest.mocked(useLocalSearchParams).mockReturnValue({ partner: JONAS });

    await open(api);

    expect(await screen.findByText('Guten Tag! Haben Sie Fragen?')).toBeTruthy();
  });

  it('records a voice note, shows it written down, and the partner recording its answer', async () => {
    const api = inApp();
    const recorder = createFakeRecorder();
    await open(api, { recorder });

    await fireEvent.press(screen.getByRole('button', { name: 'Record a voice note' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Stop' }));

    expect(await screen.findByText('Ich habe gestern ein Film gesehen')).toBeTruthy();
    expect(screen.getByText('Lena is recording a reply…')).toBeTruthy();
    expect(api.calls).toContainEqual([
      'sendPenPalReply',
      LENA,
      { audio: 'AAEC', format: 'm4a', durationMs: 2400 },
    ]);
  });

  it('turns the pending answer into the finished one, with a correction marked as a hint', async () => {
    jest.useFakeTimers();
    try {
      const api = inApp();
      const recorder = createFakeRecorder();
      await open(api, { recorder });
      await fireEvent.press(screen.getByRole('button', { name: 'Record a voice note' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Stop' }));
      await screen.findByText('Lena is recording a reply…');

      api.penPalWritten('note_2', {
        text: 'Das klingt schön! Welchen Film hast du gesehen?',
        replyTo: 'note_1',
        corrections: [
          {
            original: 'ein Film',
            corrected: 'einen Film',
            explanation: 'After sehen, the accusative: einen.',
            category: 'case',
            certain: false,
          },
        ],
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(3500);
      });

      expect(
        await screen.findByText('Das klingt schön! Welchen Film hast du gesehen?'),
      ).toBeTruthy();
      expect(screen.getByText('After sehen, the accusative: einen.')).toBeTruthy();
      expect(screen.getByText('Not sure')).toBeTruthy();
      expect(screen.queryByText('Lena is recording a reply…')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('asks the partner for a note and shows it pending', async () => {
    const api = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Ask Lena for a note' }));

    expect(await screen.findByText('Lena is recording a note…')).toBeTruthy();
    expect(api.calls).toContainEqual(['askForPenPalNote', LENA]);
  });

  it('says so when today’s limit is reached', async () => {
    const api = inApp();
    api.failNext('askForPenPalNote', 'limit');
    await open(api);

    await fireEvent.press(screen.getByRole('button', { name: 'Ask Lena for a note' }));

    expect(await screen.findByText('That’s all for today. Try again tomorrow.')).toBeTruthy();
  });

  it('says a very short note was too short', async () => {
    const api = inApp();
    api.failNext('sendPenPalReply', 'too_short');
    await open(api);

    await fireEvent.press(screen.getByRole('button', { name: 'Record a voice note' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Stop' }));

    expect(await screen.findByText('That was very short. Say a little more.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record a voice note' })).toBeTruthy();
  });

  it('says so when the microphone is not allowed', async () => {
    const recorder = createFakeRecorder();
    recorder.failNextStart('mic_denied');
    await open(inApp(), { recorder });

    await fireEvent.press(screen.getByRole('button', { name: 'Record a voice note' }));

    expect(await screen.findByText(/Konvami can’t use the microphone/)).toBeTruthy();
  });

  it('offers another try for a note that did not come through', async () => {
    const api = inApp();
    api.penPalNotes(LENA, [{ status: 'failed', text: '', audioUrl: null, read: true }]);
    await open(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));

    expect(api.calls).toContainEqual(['retryPenPalNote', 'note_1']);
    expect(await screen.findByText('Lena is recording a note…')).toBeTruthy();
  });

  it('turns notes on in the settings and sends the device’s time zone with it', async () => {
    const api = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent(
      await screen.findByRole('switch', { name: 'My partners write to me' }),
      'valueChange',
      true,
    );

    await waitFor(() =>
      expect(api.calls).toContainEqual([
        'updatePenPalSettings',
        { enabled: true, timezone: 'Europe/Zurich' },
      ]),
    );
    await fireEvent.press(await screen.findByRole('radio', { name: '5' }));
    await waitFor(() =>
      expect(api.calls).toContainEqual([
        'updatePenPalSettings',
        { perWeek: 5, timezone: 'Europe/Zurich' },
      ]),
    );
  });

  it('can be left to the sign-in when signed out', async () => {
    await renderScreen(<PenPalScreen />, { api: createFakeApi() });

    expect(await screen.findByText(/redirect:/)).toBeTruthy();
  });
});
