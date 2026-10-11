import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { PAGE_SIZE } from '@/practice/library-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { LibraryScreen } from '.';
import { TranscriptScreen } from './transcript';

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

const NETWORK = 'Can’t reach Konvami. Check your connection and try again.';

describe('5.5 Library', () => {
  async function open(api: FakeApi = inApp()) {
    await renderScreen(<LibraryScreen />, { api, signedIn: true });
    await waitFor(() => expect(screen.queryByText('Loading your conversations')).toBeNull());
    return api;
  }

  it('tells a learner without conversations what will be here and how to start', async () => {
    await open();

    expect(screen.getByRole('header', { name: 'Library' })).toBeTruthy();
    expect(screen.getByText('No conversations yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start talking' }));

    expect(router.navigate).toHaveBeenCalledWith('/talk');
  });

  it('lists conversations newest first with their partner, day and length', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_old', daysAgo: 3, minutes: 4 });
    api.talked(1, { id: 'rtc_new', minutes: 12 });
    await open(api);

    const rows = screen.getAllByRole('button', { name: /min$/ });
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'Jonas, today, 12 min',
      'Lena, 3 days ago, 4 min',
    ]);
    expect(screen.getByText('Today · 12 min')).toBeTruthy();
    expect(screen.queryByText('No conversations yet')).toBeNull();
  });

  it('opens a conversation', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_1' });
    await open(api);

    await fireEvent.press(screen.getByRole('button', { name: 'Lena, today, 5 min' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/conversations/[id]',
      params: { id: 'rtc_1' },
    });
  });

  it('shows older conversations on request', async () => {
    const api = inApp();
    for (let n = PAGE_SIZE + 1; n >= 1; n -= 1) api.talked(0, { hoursAgo: n, minutes: n });
    await open(api);
    expect(screen.getAllByRole('button', { name: /^Lena, / })).toHaveLength(PAGE_SIZE);

    await fireEvent.press(screen.getByRole('button', { name: 'Show older conversations' }));

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Lena, / })).toHaveLength(PAGE_SIZE + 1),
    );
    expect(screen.queryByRole('button', { name: 'Show older conversations' })).toBeNull();
  });

  it('keeps the list when older conversations cannot be loaded', async () => {
    const api = inApp();
    for (let n = PAGE_SIZE + 1; n >= 1; n -= 1) api.talked(0, { hoursAgo: n });
    await open(api);
    api.failNext('getConversations', 'network');

    await fireEvent.press(screen.getByRole('button', { name: 'Show older conversations' }));

    expect(
      await screen.findByText('Older conversations couldn’t be loaded. Try again.'),
    ).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Lena, / })).toHaveLength(PAGE_SIZE);
  });

  it('says so when the conversations cannot be loaded and tries again', async () => {
    const api = inApp();
    api.talked(0);
    api.failNext('getConversations', 'network');
    await renderScreen(<LibraryScreen />, { api, signedIn: true });

    expect(await screen.findByText(NETWORK)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Lena, today, 5 min' })).toBeTruthy();
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<LibraryScreen />, { api: inApp() });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});

describe('5.6 Transcript', () => {
  async function open(api: FakeApi, id: string) {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id });
    await renderScreen(<TranscriptScreen />, { api, signedIn: true });
    await waitFor(() => expect(screen.queryByText('Opening the conversation')).toBeNull());
  }

  it('shows who the conversation was with and what each side said, in order', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_1', minutes: 8, learnerSays: ['Gut, danke!', 'Und dir?'] });
    await open(api, 'rtc_1');

    expect(screen.getByRole('header', { name: 'With Lena' })).toBeTruthy();
    expect(screen.getByText(/8 min/)).toBeTruthy();
    const lines = screen.getAllByLabelText(/^(Lena|You): /);
    expect(lines.map((line) => line.props.accessibilityLabel)).toEqual([
      'Lena: Hallo! Wie geht’s dir heute?',
      'You: Gut, danke!',
      'You: Und dir?',
    ]);
  });

  it('leads to the report on the conversation', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_1' });
    await open(api, 'rtc_1');

    const row = screen.getByRole('button', { name: 'Session report' });
    expect(row.props.accessibilityHint).toBe('Corrections, new words and what to practise next');
    await fireEvent.press(row);

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/conversations/[id]/report',
      params: { id: 'rtc_1' },
    });
  });

  it('offers no report for a call in which the learner said nothing', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_1', learnerSays: [] });
    await open(api, 'rtc_1');

    expect(screen.queryByRole('button', { name: 'Session report' })).toBeNull();
  });

  it('goes back to where the learner came from', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_1' });
    await open(api, 'rtc_1');

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(router.back).toHaveBeenCalled();
  });

  it('says so when the conversation no longer exists', async () => {
    await open(inApp(), 'rtc_gone');

    expect(screen.getByText('This conversation no longer exists.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('says so when the conversation cannot be loaded and tries again', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_1' });
    api.failNext('getConversation', 'network');
    await open(api, 'rtc_1');

    expect(screen.getByText(NETWORK)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('header', { name: 'With Lena' })).toBeTruthy();
  });

  it('says so when nothing was said', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_running', ended: false });
    await open(api, 'rtc_running');

    expect(screen.getByText('Nothing was said in this conversation.')).toBeTruthy();
  });
});
