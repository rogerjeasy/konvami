import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_PERSONAS, FAKE_STORY_EPISODE, type FakeApi } from '@/test/fake-api';
import { createFakeProfileDevice } from '@/test/fake-profile-device';
import { createFakeRecorder } from '@/test/fake-recorder';
import { renderScreen } from '@/test/render';
import { StoriesScreen } from '.';
import { StoryEpisodeScreen } from './episode';

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

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

describe('5.29 Stories', () => {
  it('invites a first episode, asks for it, and shows it being written until it is ready', async () => {
    const api = inApp();
    await renderScreen(<StoriesScreen />, { api, signedIn: true });

    expect(await screen.findByText('Your first episode')).toBeTruthy();
    expect(screen.getByText('3 more today')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Next episode' }));

    expect(await screen.findByText('Writing episode 1…')).toBeTruthy();
    expect(api.calls).toContainEqual(['makeStory', []]);
    // One episode at a time.
    expect(screen.getByRole('button', { name: 'Next episode' })).toBeDisabled();
  });

  it('lists the episodes newest first and opens a ready one', async () => {
    const api = inApp();
    api.storyEpisodes([{ title: 'Lenas Wohnung' }, { title: 'Der Umzug', listened: false }]);
    await renderScreen(<StoriesScreen />, { api, signedIn: true });

    const second = await screen.findByRole('button', { name: 'Episode 2: Der Umzug' });
    expect(screen.getByRole('button', { name: 'Episode 1: Lenas Wohnung' })).toBeTruthy();
    await fireEvent.press(second);

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/stories/[id]',
      params: { id: 'story_2' },
    });
  });

  it('says calmly why a new episode cannot be asked for', async () => {
    const api = inApp();
    api.failNext('makeStory', 'daily_limit');
    await renderScreen(<StoriesScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Next episode' }));

    expect(
      await screen.findAllByText('That’s all for today. A new episode tomorrow.'),
    ).not.toHaveLength(0);
  });
});

describe('5.29 One episode', () => {
  async function openEpisode(api: FakeApi, options: Parameters<typeof renderScreen>[1] = {}) {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'story_1' });
    const device = createFakeProfileDevice();
    await renderScreen(<StoryEpisodeScreen />, { api, signedIn: true, device, ...options });
    await screen.findByRole('header', { name: FAKE_STORY_EPISODE.title });
    return device;
  }

  it('hides the text until asked, plays line after line, and asks its question at the end', async () => {
    const api = inApp();
    api.storyEpisodes([{ cast: [LENA] }]);
    const device = await openEpisode(api);

    expect(screen.queryByText('Heute sehe ich eine Wohnung.')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Tap to show this line' })).toHaveLength(4);
    expect(screen.getByText('Listen to the end, then answer.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    for (const line of FAKE_STORY_EPISODE.lines) {
      expect(device.playing).toBe(line.audioUrl);
      await act(() => device.finishClip());
    }

    expect(await screen.findByText('Wie heißt der Vermieter?')).toBeTruthy();
    await waitFor(() => expect(api.calls).toContainEqual(['listenedToStory', 'story_1']));
  });

  it('shows the text with every word to look up when captions are on', async () => {
    const api = inApp();
    api.storyEpisodes([{}]);
    await openEpisode(api);

    await fireEvent.press(screen.getByRole('switch', { name: 'Show the text' }));

    expect(screen.getByRole('button', { name: 'Look up Wohnung' })).toBeTruthy();
  });

  it('checks an answer said out loud, and shows the answer without alarm when it is not it', async () => {
    const api = inApp();
    api.storyEpisodes([{ listened: true }]);
    api.nextStoryHeard('Ich weiß es nicht.');
    const recorder = createFakeRecorder();
    await openEpisode(api, { recorder });

    await fireEvent.press(screen.getByRole('button', { name: 'Answer out loud' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Stop' }));

    expect(await screen.findByText('Not quite yet')).toBeTruthy();
    expect(screen.getByText('The answer: Herr Keller')).toBeTruthy();
    expect(api.calls).toContainEqual([
      'answerStoryQuestion',
      'story_1',
      0,
      { audio: 'AAEC', format: 'm4a', durationMs: 2400 },
    ]);

    api.nextStoryHeard('Er heißt Herr Keller.');
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Stop' }));
    expect(await screen.findByText('Right!')).toBeTruthy();
  });

  it('says an episode is still being written', async () => {
    const api = inApp();
    api.storyEpisodes([{ status: 'pending', title: '' }]);
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'story_1' });
    await renderScreen(<StoryEpisodeScreen />, { api, signedIn: true });

    expect(await screen.findByText('Writing episode 1…')).toBeTruthy();
  });
});
