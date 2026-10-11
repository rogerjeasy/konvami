import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_MEMORIES, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { MemoryScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useFocusEffect: jest.fn(),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

/** A learner whose partners know four things about them. */
function remembering(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  api.remembering();
  return api;
}

function nothingYet(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

describe('6.10 What my partners know', () => {
  async function open(api: FakeApi = remembering()) {
    await renderScreen(<MemoryScreen />, { api, signedIn: true });
    await waitFor(() => expect(screen.queryByText('Loading what your partners know')).toBeNull());
    return api;
  }

  /** The settings the screen sent, oldest first. */
  const configured = (api: FakeApi) =>
    api.calls.filter(([method]) => method === 'configureMemories').map(([, settings]) => settings);

  const memorySwitch = () => screen.getByRole('switch', { name: 'Remember our conversations' });

  async function addTopic(topic: string) {
    await fireEvent.changeText(screen.getByLabelText('Add a topic'), topic);
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
  }

  it('lists what the partners know, in groups, each one a way in to change it', async () => {
    await open();

    expect(screen.getByRole('header', { name: 'What my partners know' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Dates and plans, 1' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'About you, 2' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'With Lena, 1' })).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'October 16, 2026: Has a job interview at a logistics company in Zurich.',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Would rather not talk about politics.' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Promised Lena a photo of her sister’s visit.' }),
    ).toBeTruthy();
  });

  it('opens a memory', async () => {
    await open();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Works as a nurse and wants to change jobs.' }),
    );

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/account/memory/[id]',
      params: { id: FAKE_MEMORIES[2]!.id },
    });
  });

  it('names a partner who is no longer there without a name', async () => {
    const api = nothingYet();
    api.remembering([{ ...FAKE_MEMORIES[0]!, partnerName: null }]);

    await open(api);

    expect(screen.getByRole('header', { name: 'With a former partner, 1' })).toBeTruthy();
  });

  it('says what will be here when nothing is known yet, and shows nothing made up', async () => {
    await open(nothingYet());

    expect(screen.getByText('Nothing here yet')).toBeTruthy();
    expect(
      screen.getByText(
        'After your next conversation, a few things worth knowing next time will appear here.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('header', { name: /About you/ })).toBeNull();
    // An empty list is not counted: no "0" beside its title.
    expect(screen.getByRole('header', { name: 'Off-limits topics' })).toBeTruthy();
    expect(memorySwitch()).toBeChecked();
  });

  it('does not promise notes to a learner who has memory off', async () => {
    const api = nothingYet();
    await api.configureMemories({ enabled: false });

    await open(api);

    expect(memorySwitch()).not.toBeChecked();
    expect(
      screen.getByText('Memory is off, so nothing is written down after a conversation.'),
    ).toBeTruthy();
    expect(screen.queryByText(/After your next conversation/)).toBeNull();
  });

  it('turns memory off and says what that means', async () => {
    const api = await open();

    await fireEvent.press(memorySwitch());

    await waitFor(() => expect(configured(api)).toEqual([{ enabled: false }]));
    expect(memorySwitch()).not.toBeChecked();
    expect(
      screen.getByText(
        'Nothing new is written down, and your partners are told nothing from before. What is listed below stays until you delete it.',
      ),
    ).toBeTruthy();
    // What was known is still listed.
    expect(screen.getByRole('header', { name: 'About you, 2' })).toBeTruthy();
  });

  it('puts the switch back when the choice could not be saved', async () => {
    const api = remembering();
    await open(api);
    api.failNext('configureMemories', 'network');

    await fireEvent.press(memorySwitch());

    expect(await screen.findByText('That couldn’t be saved. Try again.')).toBeTruthy();
    expect(memorySwitch()).toBeChecked();
  });

  it('puts a topic off limits', async () => {
    const api = await open();
    expect(
      screen.getByText(
        'Your partners never bring these up, and nothing about them is written down.',
      ),
    ).toBeTruthy();

    await addTopic('  my divorce ');

    expect(await screen.findByText('my divorce')).toBeTruthy();
    expect(configured(api)).toEqual([{ avoidTopics: ['my divorce'] }]);
    expect(screen.getByLabelText('Add a topic')).toHaveProp('value', '');
    expect(screen.getByRole('header', { name: 'Off-limits topics, 1' })).toBeTruthy();
  });

  it('does not list a topic twice', async () => {
    const api = await open();
    await addTopic('Politics');
    await screen.findByText('Politics');

    await addTopic(' politics');

    expect(screen.getByText('That topic is already on your list.')).toBeTruthy();
    expect(configured(api)).toHaveLength(1);
  });

  it('adds nothing for a topic without a word', async () => {
    const api = await open();

    await addTopic('   ');

    expect(configured(api)).toEqual([]);
  });

  it('takes a topic off the list', async () => {
    const api = remembering();
    await api.configureMemories({ avoidTopics: ['politics', 'my divorce'] });
    await open(api);

    await fireEvent.press(screen.getByRole('button', { name: 'Remove “my divorce”' }));

    await waitFor(() => expect(screen.queryByText('my divorce')).toBeNull());
    expect(configured(api).at(-1)).toEqual({ avoidTopics: ['politics'] });
    expect(screen.getByText('politics')).toBeTruthy();
  });

  it('keeps the topic in the field when it could not be saved', async () => {
    const api = await open();
    api.failNext('configureMemories', 'network');

    await addTopic('my divorce');

    expect(await screen.findByText('That couldn’t be saved. Try again.')).toBeTruthy();
    expect(screen.getByLabelText('Add a topic')).toHaveProp('value', 'my divorce');
    expect(screen.queryByRole('button', { name: 'Remove “my divorce”' })).toBeNull();
  });

  it('takes no more topics once the list is full', async () => {
    const api = remembering();
    await api.configureMemories({
      avoidTopics: Array.from({ length: 10 }, (_, number) => `topic ${number + 1}`),
    });

    await open(api);

    expect(screen.queryByLabelText('Add a topic')).toBeNull();
    expect(screen.getByText('Your list is full. Remove a topic to add another.')).toBeTruthy();
  });

  it('says so when it could not be loaded, and tries again', async () => {
    const api = remembering();
    api.failNext('getMemories', 'network');
    await open(api);

    expect(screen.getByText(/check your connection/i)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('header', { name: 'About you, 2' })).toBeTruthy();
  });

  it('is only for someone signed in', async () => {
    await renderScreen(<MemoryScreen />, { api: remembering() });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
