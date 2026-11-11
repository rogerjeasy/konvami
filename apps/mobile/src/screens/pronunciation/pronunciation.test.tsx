import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { createFakeProfileDevice } from '@/test/fake-profile-device';
import { createFakeRecorder } from '@/test/fake-recorder';
import { renderScreen } from '@/test/render';
import { assessmentAudio } from '@/voice/assessment-audio';
import { PronunciationLabScreen } from '.';
import { PronunciationSoundScreen } from './sound';

jest.mock('@/voice/assessment-audio', () => ({
  canAssessAudio: () => true,
  assessmentAudio: jest.fn(async (recording) => ({ ...recording, format: 'wav' })),
}));

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

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

async function openLab(
  api: FakeApi = inApp(),
  options: { recorder?: ReturnType<typeof createFakeRecorder> } = {},
) {
  await renderScreen(<PronunciationLabScreen />, { api, signedIn: true, ...options });
  await screen.findByRole('header', { name: 'Pronunciation lab' });
  await waitFor(() => expect(screen.queryByText('Opening the pronunciation lab')).toBeNull());
  return api;
}

async function openSound(api: FakeApi = inApp(), options: Parameters<typeof renderScreen>[1] = {}) {
  jest.mocked(useLocalSearchParams).mockReturnValue({ sound: 'ue' });
  await renderScreen(<PronunciationSoundScreen />, { api, signedIn: true, ...options });
  await screen.findByRole('header', { name: 'ü' });
  return api;
}

async function say() {
  await fireEvent.press(await screen.findByRole('button', { name: 'Record' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Stop' }));
}

describe('5.22 Pronunciation lab', () => {
  it('lists the sounds and says that what it tells is an approximation', async () => {
    await openLab();

    expect(screen.getByRole('button', { name: 'ü' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'b, d, g at the end' })).toBeTruthy();
    expect(screen.getAllByText('Not tried yet')).toHaveLength(2);
    expect(screen.getByText(/That is an approximation/)).toBeTruthy();
  });

  it('opens a sound', async () => {
    await openLab();

    await fireEvent.press(screen.getByRole('button', { name: 'ü' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/pronunciation/[sound]',
      params: { sound: 'ue' },
    });
  });

  it('has no list of problem words until a word was missed', async () => {
    await openLab();

    expect(screen.queryByText('Your problem words')).toBeNull();
  });

  it('lists the words that were missed, and drills one', async () => {
    const api = inApp();
    api.missedWords([{ word: 'Brücke', soundId: 'ue', misses: 2 }]);
    await openLab(api);
    expect(screen.getByText('Your problem words')).toBeTruthy();
    expect(screen.getByText('Missed 2 times')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Brücke' }));
    await say();

    expect(await screen.findByText('Heard as asked!')).toBeTruthy();
    expect(api.calls).toContainEqual([
      'drillPronunciation',
      {
        drill: 'word',
        soundId: null,
        target: 'Brücke',
        recording: { audio: 'AAEC', format: 'm4a', durationMs: 2400 },
      },
    ]);
  });

  it('says there is nothing to drill for a language without sounds', async () => {
    const api = inApp();
    jest.spyOn(api, 'getPronunciationSounds').mockResolvedValue({ sounds: [] });

    await openLab(api);

    expect(screen.getByText('No sound drills for this language yet')).toBeTruthy();
  });
});

describe('5.22 One sound', () => {
  it('explains the sound and offers the pairs, words and sentences', async () => {
    await openSound();

    expect(screen.getByText('Say i and round your lips as if for u.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'vier · für' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'fühlen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Die Tür ist für dich.' })).toBeTruthy();
  });

  it('does not offer to listen and pick when the words of a pair sound alike', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ sound: 'final_devoicing' });
    await renderScreen(<PronunciationSoundScreen />, { api: inApp(), signedIn: true });
    await screen.findByRole('header', { name: 'b, d, g at the end' });

    expect(screen.queryByText('Listen and pick')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hund · Hunde' })).toBeTruthy();
  });

  it('plays a word without telling which one it is, and takes the pick', async () => {
    const device = createFakeProfileDevice();
    const api = await openSound(inApp(), { device });

    await fireEvent.press(screen.getByRole('button', { name: 'Play the word' }));
    await waitFor(() =>
      expect(device.played).toEqual(['https://files.test/pronunciation/vier.mp3']),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'vier' }));

    expect(await screen.findByText('Yes, it was vier.')).toBeTruthy();
    expect(api.calls).toContainEqual([
      'pickPronunciationWord',
      { soundId: 'ue', played: 'vier', chosen: 'vier' },
    ]);
  });

  it('tells a wrong pick what the word was and goes on to the next', async () => {
    await openSound();

    await fireEvent.press(screen.getByRole('button', { name: 'für' }));

    expect(await screen.findByText(/It was vier\./)).toBeTruthy();
    expect(screen.queryByText(/wrong/i)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Next word' }));
    // The next pair is played, on its other side.
    await fireEvent.press(screen.getByRole('button', { name: 'Tür' }));
    expect(await screen.findByText('Yes, it was Tür.')).toBeTruthy();
  });

  it('says a pair and marks the words that were not heard as asked', async () => {
    const api = await openSound();
    api.hearsNextDrill('vier');

    await fireEvent.press(screen.getByRole('button', { name: 'vier · für' }));
    await say();

    expect(await screen.findByText(/Not quite yet/)).toBeTruthy();
    expect(screen.getByLabelText('Not heard as asked: für')).toBeTruthy();
    expect(screen.getByText('I heard: vier')).toBeTruthy();
    // Said on the page and again under the result.
    expect(screen.getAllByText(/approximation/)).toHaveLength(2);
    // The pair is heard word by word first.
    expect(screen.getByRole('button', { name: 'Play vier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play für' })).toBeTruthy();
    expect(api.calls).toContainEqual([
      'drillPronunciation',
      expect.objectContaining({ drill: 'word', soundId: 'ue', target: 'vier für' }),
    ]);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Record' })).toBeTruthy();
  });

  it('shadows a sentence, at a slow speed when asked', async () => {
    const api = await openSound();

    await fireEvent.press(screen.getByRole('button', { name: 'Die Tür ist für dich.' }));
    expect(screen.getByRole('radio', { name: 'Normal speed' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Slow' }));
    await say();

    expect(await screen.findByText('Heard as asked!')).toBeTruthy();
    expect(api.calls).toContainEqual([
      'drillPronunciation',
      expect.objectContaining({ drill: 'shadow', soundId: 'ue', target: 'Die Tür ist für dich.' }),
    ]);
  });

  it('says so when the microphone is not allowed', async () => {
    const recorder = createFakeRecorder();
    recorder.failNextStart('mic_denied');
    await openSound(inApp(), { recorder });

    await fireEvent.press(screen.getByRole('button', { name: 'fühlen' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Record' }));

    expect(await screen.findByText(/Konvami can’t use the microphone/)).toBeTruthy();
  });

  it('says a sound is not in the lab when it is not', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ sound: 'click' });
    await renderScreen(<PronunciationSoundScreen />, { api: inApp(), signedIn: true });

    expect(await screen.findByText('This sound isn’t in the lab.')).toBeTruthy();
  });
});

it('offers acoustic assessment only when configured and sends it after explicit consent', async () => {
  const api = inApp();
  const original = api.getPronunciationSounds.bind(api);
  jest
    .spyOn(api, 'getPronunciationSounds')
    .mockImplementation(async () => ({ ...(await original()), assessmentProvider: 'Test speech' }));
  await openSound(api);
  await fireEvent.press(screen.getByRole('button', { name: 'fühlen' }));
  const consent = await screen.findByRole('switch', { name: 'Assess pronunciation' });
  expect(consent).not.toBeChecked();
  await fireEvent.press(consent);
  await say();
  await screen.findByText('Heard as asked!');
  expect(assessmentAudio).toHaveBeenCalled();
  expect(api.calls).toContainEqual([
    'drillPronunciation',
    expect.objectContaining({
      assessmentConsent: true,
      recording: expect.objectContaining({ format: 'wav' }),
    }),
  ]);
});
