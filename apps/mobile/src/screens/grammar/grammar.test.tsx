import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { GrammarMapScreen } from '.';
import { GrammarTopicScreen } from './topic';

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

describe('5.14 Grammar map', () => {
  async function open(api: FakeApi = inApp()) {
    await renderScreen(<GrammarMapScreen />, { api, signedIn: true });
    await screen.findByRole('header', { name: 'Grammar map' });
    await screen.findByText('Dative');
    return api;
  }

  it('lists every topic by level, with how well the learner uses it', async () => {
    await open();

    expect(screen.getByRole('header', { name: 'A1' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'A2 · your level' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'B2' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /^Dative, Practising, 5 of 10 right$/ }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Present tense, Mastered/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Passive, Not started$/ })).toBeTruthy();
  });

  it('says how much is mastered or nearly', async () => {
    await open();

    expect(screen.getByText('3 of 11 topics mostly right or mastered')).toBeTruthy();
  });

  it('opens a topic', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: /^Dative,/ }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/grammar/[topic]',
      params: { topic: 'dative' },
    });
  });

  it('offers to try again when the map cannot be read', async () => {
    const api = inApp();
    api.failNext('getGrammarMap', 'network');
    await renderScreen(<GrammarMapScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Dative')).toBeTruthy();
  });
});

describe('5.15 Grammar topic', () => {
  async function open(topic = 'dative', api: FakeApi = inApp()) {
    jest.mocked(useLocalSearchParams).mockReturnValue({ topic });
    await renderScreen(<GrammarTopicScreen />, { api, signedIn: true });
    return api;
  }

  it('says how well the learner uses it and where it is going', async () => {
    await open();

    expect(await screen.findByRole('header', { name: 'Dative' })).toBeTruthy();
    expect(screen.getByText('Practising')).toBeTruthy();
    expect(screen.getByText('5 of 10 uses right, in 4 conversations')).toBeTruthy();
    expect(screen.getByText('Slipping lately')).toBeTruthy();
  });

  it('shows the topic used well, typical mistakes and the learner’s own', async () => {
    await open();

    expect(await screen.findByText('Ich fahre mit dem Bus.')).toBeTruthy();
    expect(screen.getByText('Ich helfe meine Mutter.')).toBeTruthy();
    const yours = within(screen.getByTestId('topic-mistakes'));
    expect(yours.getByLabelText(/You said: mit der Bus/)).toBeTruthy();
    expect(yours.getByText('Not sure')).toBeTruthy();
  });

  it('leads to the conversation a mistake was made in', async () => {
    await open();

    const reads = await screen.findAllByRole('button', { name: 'Read the conversation' });
    await fireEvent.press(reads[1]!);

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/conversations/[id]',
      params: { id: 'rtc_1' },
    });
  });

  it('starts a conversation that practises it, with the partner Today suggests', async () => {
    await open();

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Practise this in conversation' }),
    );

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/call/[personaId]',
        params: { personaId: expect.any(String), practise: 'dative' },
      }),
    );
  });

  it('asks the tutor about it', async () => {
    await open();

    await fireEvent.press(await screen.findByRole('button', { name: 'Ask the tutor about it' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/tutor',
      params: { question: 'How does “Dative” work? Explain it with examples.' },
    });
  });

  it('says so when nothing was said wrong on it yet', async () => {
    await open('present_tense');

    expect(
      await screen.findByText('No mistakes on this topic in your conversations.'),
    ).toBeTruthy();
  });

  it('says so when the topic does not exist', async () => {
    await open('klingon');

    expect(await screen.findByText('This topic isn’t on your map.')).toBeTruthy();
  });
});
