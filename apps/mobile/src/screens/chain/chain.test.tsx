import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { router, useLocalSearchParams } from 'expo-router';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { FAKE_CHAIN_CODE } from '@/test/fake-chain';
import { createFakeRecorder } from '@/test/fake-recorder';
import { renderScreen } from '@/test/render';
import { ChainQueue } from '@/screens/flags/halves-queue';
import { ChainScreen } from '.';
import { ChainInviteScreen, ChainRedeemScreen } from './invite';
import { ChainJoinScreen } from './join';
import { ChainMineScreen } from './mine';
import { ChainPlayScreen } from './play';
import { ChainSettingsScreen } from './settings';
import { ChainSetupScreen } from './setup';
import { ChainStoryScreen } from './story';
import { ChainTurnScreen } from './turn';

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

const AI = [{ kind: 'ai' as const }, { kind: 'ai' as const }, { kind: 'ai' as const }];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

/** A learner in the app with the story chain open, joined, and one story with AI characters. */
async function telling(): Promise<{ api: FakeApi; storyId: string }> {
  const api = createFakeApi();
  api.enterApp();
  api.chainOpen();
  await api.joinChain({ veilDefault: true, voiceConsent: true });
  const story = await api.startChainStory({ openingId: 'night-train', seats: AI });
  return { api, storyId: story.id };
}

describe('9.1 Story chain', () => {
  it('says it is not open yet for an account it is not open to', async () => {
    const api = createFakeApi();
    api.enterApp();
    await renderScreen(<ChainScreen />, { api, signedIn: true });

    expect(await screen.findByText(/isn’t open for your account yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Join the story chain' })).toBeNull();
  });

  it('lists the stories, the learner’s turn first, and starts a new one', async () => {
    const { api } = await telling();
    await renderScreen(<ChainScreen />, { api, signedIn: true });

    expect(await screen.findByText('You play as Linde-7')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'The Night Train, Your turn' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start a story' }));
    expect(router.push).toHaveBeenCalledWith('/chain/new');
  });
});

describe('9.2 Join', () => {
  it('needs the voice-sharing agreement', async () => {
    const api = createFakeApi();
    api.enterApp();
    api.chainOpen();
    await renderScreen(<ChainJoinScreen />, { api, signedIn: true });

    const join = await screen.findByRole('button', { name: 'Join' });
    expect(join).toBeDisabled();
    await fireEvent(
      screen.getByRole('switch', {
        name: 'I agree that the other players of my stories hear my lines',
      }),
      'valueChange',
      true,
    );
    await fireEvent.press(join);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/chain'));
    expect(api.calls).toContainEqual(['joinChain', { veilDefault: true, voiceConsent: true }]);
  });
});

describe('9.3 A new story', () => {
  it('starts with the chosen opening and a friend’s seat, then shows the code', async () => {
    const api = createFakeApi();
    api.enterApp();
    api.chainOpen();
    await api.joinChain({ veilDefault: true, voiceConsent: true });
    await renderScreen(<ChainSetupScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('radio', { name: /The Wrong Cake/ }));
    const friend = screen.getAllByRole('radio', { name: 'A friend with a code' })[0];
    if (!friend) throw new Error('no seat choice');
    await fireEvent.press(friend);
    await fireEvent.press(screen.getByRole('button', { name: 'Start the story' }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/chain/[id]/invite',
        params: { id: 'story-1' },
      }),
    );
    expect(api.calls).toContainEqual([
      'startChainStory',
      {
        openingId: 'wrong-cake',
        seats: [{ kind: 'friend' }, { kind: 'ai' }, { kind: 'ai' }],
      },
    ]);
  });
});

describe('9.4 Your turn', () => {
  it('hears the opening, records a line, listens back and sends it', async () => {
    const { api, storyId } = await telling();
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: storyId });
    const recorder = createFakeRecorder();
    await renderScreen(<ChainTurnScreen />, { api, signedIn: true, recorder });

    expect(await screen.findByText(/The narrator opens the story/)).toBeTruthy();
    // The words are behind a tap: listening comes first.
    expect(screen.queryByText(/Es ist Mitternacht/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Show the words' }));
    expect(screen.getByText(/Es ist Mitternacht/)).toBeTruthy();

    await fireEvent(
      screen.getByRole('switch', { name: 'Veil: my exact words in a neutral voice' }),
      'valueChange',
      false,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Record my line' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Stop' }));
    expect(await screen.findByRole('button', { name: 'Listen to my line' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Send my line' }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/chain/[id]',
        params: { id: storyId },
      }),
    );
    expect(api.calls).toContainEqual([
      'sendChainLine',
      storyId,
      { audio: 'AAEC', format: 'm4a', durationMs: 2400, veiled: false },
    ]);
  });

  it('reports the line before and hides it', async () => {
    const { api, storyId } = await telling();
    await api.sendChainLine(storyId, { audio: 'AAEC', format: 'm4a' });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: storyId });
    await renderScreen(<ChainTurnScreen />, { api, signedIn: true });

    expect(await screen.findByText('So far')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Report this line' }));
    await fireEvent.press(await screen.findByRole('radio', { name: /Harassment/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByText(/You reported this line/)).toBeTruthy();
  });
});

describe('9.5 The story so far', () => {
  it('shows the table, what the learner heard and said, and their turn', async () => {
    const { api, storyId } = await telling();
    await api.sendChainLine(storyId, { audio: 'AAEC', format: 'm4a' });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: storyId });
    await renderScreen(<ChainStoryScreen />, { api, signedIn: true });

    expect(await screen.findByText('4 of 8 lines told')).toBeTruthy();
    expect(screen.getByText('It’s your turn')).toBeTruthy();
    expect(screen.getByText('Ich sehe einen Mann mit ein Hut.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Take my turn' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/chain/[id]/turn',
      params: { id: storyId },
    });
  });
});

describe('9.6 The radio play', () => {
  it('reveals the story, plays it and takes a reaction card', async () => {
    const { api, storyId } = await telling();
    api.chainFinish(storyId);
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: storyId });
    await renderScreen(<ChainPlayScreen />, { api, signedIn: true });

    expect(await screen.findByText('Your story, told by four voices and a narrator.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Play the story' }));
    await waitFor(() => expect(api.calls).toContainEqual(['getChainPlayAudio', storyId, 0]));
    await fireEvent.press(screen.getByRole('radio', { name: 'Made me laugh · 0' }));

    expect(await screen.findByRole('radio', { name: 'Made me laugh · 1' })).toBeTruthy();
  });
});

describe('9.7 My lines, privately', () => {
  it('shows a confirmed correction and keeps it as a card', async () => {
    const { api, storyId } = await telling();
    await api.sendChainLine(storyId, { audio: 'AAEC', format: 'm4a' });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: storyId });
    await renderScreen(<ChainMineScreen />, { api, signedIn: true });

    expect(await screen.findByText(/„mit“ takes the dative/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep as a card' }));
    expect(await screen.findByRole('button', { name: 'Kept as a card' })).toBeTruthy();
    expect(api.calls).toContainEqual(['saveChainCard', 'line-1', 0]);
  });
});

describe('9.8 Settings', () => {
  it('changes the veil and gives another codename', async () => {
    const { api } = await telling();
    await renderScreen(<ChainSettingsScreen />, { api, signedIn: true });

    await fireEvent(
      await screen.findByRole('switch', { name: 'Veil by default' }),
      'valueChange',
      false,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Another name' }));

    expect(await screen.findByText('Vega-12')).toBeTruthy();
    expect(api.calls).toContainEqual(['changeChain', { veilDefault: false }]);
  });
});

describe('9.9 Invite and take a seat', () => {
  it('shows the story’s code to share', async () => {
    const { api } = await telling();
    const story = await api.startChainStory({
      seats: [{ kind: 'friend' }, { kind: 'ai' }, { kind: 'ai' }],
    });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: story.id });
    await renderScreen(<ChainInviteScreen />, { api, signedIn: true });

    expect(await screen.findByText(FAKE_CHAIN_CODE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share the code' })).toBeTruthy();
  });

  it('takes a seat with a friend’s code, and says calmly when one is wrong', async () => {
    const { api } = await telling();
    await renderScreen(<ChainRedeemScreen />, { api, signedIn: true });

    await fireEvent.changeText(await screen.findByLabelText('Code'), 'WRONG1');
    await fireEvent.press(screen.getByRole('button', { name: 'Take my seat' }));
    expect(await screen.findByText(/That code doesn’t work/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Code'), FAKE_CHAIN_CODE.toLowerCase());
    await fireEvent.press(screen.getByRole('button', { name: 'Take my seat' }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/chain/[id]',
        params: { id: 'story-2' },
      }),
    );
  });
});

describe('9.11 The owner’s queue', () => {
  it('shows an empty story-chain queue', async () => {
    const { api } = await telling();
    await renderScreen(<ChainQueue />, { api, signedIn: true });

    expect(await screen.findByText('Story chain')).toBeTruthy();
    expect(screen.getByText('Nothing waiting.')).toBeTruthy();
  });
});
