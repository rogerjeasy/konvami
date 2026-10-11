import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_REPORT, FAKE_REPORT_SAYS, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { ProgressScreen } from '.';

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
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

function inApp(options?: Parameters<FakeApi['enterApp']>[0]): FakeApi {
  const api = createFakeApi();
  api.enterApp(options);
  return api;
}

/**
 * A learner who talked today (6 min), yesterday (5 min) and ten days ago (9 min, with Jonas).
 * The fake server's today is Friday 9 October 2026; its week began on Monday 5.
 */
function practised(options?: Parameters<FakeApi['enterApp']>[0]): FakeApi {
  const api = inApp(options);
  api.talked(1, { id: 'rtc_old', daysAgo: 10, minutes: 9 });
  api.talked(0, { id: 'rtc_yesterday', daysAgo: 1, minutes: 5 });
  api.talked(0, { id: 'rtc_today', minutes: 6, learnerSays: FAKE_REPORT_SAYS });
  return api;
}

async function open(api: FakeApi, { signedIn = true } = {}) {
  await renderScreen(<ProgressScreen />, { api, signedIn });
  if (signedIn) await waitFor(() => expect(screen.queryByText('Loading your progress')).toBeNull());
  return api;
}

describe('5.8 Progress', () => {
  it('tells a learner who has not talked yet what will be here, and shows no number', async () => {
    await open(inApp());

    expect(screen.getByRole('header', { name: 'Progress' })).toBeTruthy();
    expect(screen.getByText('Your progress will be charted here')).toBeTruthy();
    expect(screen.queryByText(/\d/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Start talking' }));

    expect(router.navigate).toHaveBeenCalledWith('/talk');
  });

  it('adds up the practice: minutes, conversations and the longest streak', async () => {
    await open(practised());

    expect(screen.getByLabelText('20 min talked')).toBeTruthy();
    expect(screen.getByLabelText('3 conversations')).toBeTruthy();
    expect(screen.getByLabelText('2 days longest streak')).toBeTruthy();
  });

  it('charts the minutes of each of the last eight weeks', async () => {
    await open(practised());

    const bars = screen.getAllByLabelText(/^Week of /);
    expect(bars.map((bar) => bar.props.accessibilityLabel)).toEqual([
      'Week of Aug 17: 0 min',
      'Week of Aug 24: 0 min',
      'Week of Aug 31: 0 min',
      'Week of Sep 7: 0 min',
      'Week of Sep 14: 0 min',
      'Week of Sep 21: 0 min',
      'Week of Sep 28: 9 min',
      'Week of Oct 5: 11 min',
    ]);
    expect(screen.getByText('Since Aug 17')).toBeTruthy();
    expect(screen.getByText('This week')).toBeTruthy();
  });

  it('shows the level, per skill when it was measured', async () => {
    await open(practised({ measured: true }));

    expect(screen.getByText('B1 · Intermediate')).toBeTruthy();
    expect(screen.getByLabelText('Speaking: B1')).toBeTruthy();
  });

  it('shows the kinds of mistake the reports confirmed, with how often they came up', async () => {
    const api = practised();
    api.reported('rtc_today');
    api.reported('rtc_yesterday', {
      ...FAKE_REPORT,
      mistakes: [
        FAKE_REPORT.mistakes[0]!,
        { ...FAKE_REPORT.mistakes[0]!, category: 'case_dative' },
      ],
    });
    await open(api);

    expect(screen.getByText('Let’s polish this')).toBeTruthy();
    expect(screen.getByLabelText('Perfekt: haben or sein: 2 times in 6 weeks')).toBeTruthy();
    expect(screen.getByLabelText('Dative: 1 time in 6 weeks')).toBeTruthy();
    // The correction the second check could not confirm is not counted.
    expect(screen.queryByLabelText(/^Word order in subordinate clauses/)).toBeNull();
  });

  it('says so when the reports noted no mistakes', async () => {
    const api = practised();
    api.reported('rtc_today', { ...FAKE_REPORT, mistakes: [] });
    await open(api);

    expect(screen.getByText('Your reports noted no mistakes in the last 6 weeks.')).toBeTruthy();
  });

  it('says nothing about mistakes or the share of the talking before there is a report', async () => {
    await open(practised());

    expect(screen.queryByText('Let’s polish this')).toBeNull();
    expect(screen.queryByText('Your share of the talking')).toBeNull();
  });

  it('shows how much of the talking was the learner’s in the last month', async () => {
    const api = practised();
    api.reported('rtc_today');
    await open(api);

    const share = screen.getByRole('progressbar', { name: 'You said 58% of the words' });
    expect(share.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 58 });
    expect(screen.getByText('In your conversations of the last 30 days.')).toBeTruthy();
  });

  it('shows the cards and how many reviews were remembered, and leads to them', async () => {
    const api = inApp();
    const cards = await api.learning();
    await api.reviewCard(cards[0]!.id, 'good');
    await api.reviewCard(cards[1]!.id, 'again');
    await open(api);

    expect(screen.getByText('3 cards · 1 due')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', {
        name: 'Remembered 50% of your reviews in the last 30 days',
      }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open my cards' }));

    expect(router.navigate).toHaveBeenCalledWith('/learn');
  });

  it('asks for a first review before it says how many were remembered', async () => {
    const api = inApp();
    await api.learning();
    await open(api);

    expect(screen.getByText('3 cards · 3 due')).toBeTruthy();
    expect(
      screen.getByText('Review a card and you’ll see here how many you remembered.'),
    ).toBeTruthy();
    expect(screen.queryByRole('progressbar', { name: /^Remembered/ })).toBeNull();
  });

  it('says nothing about cards to a learner who has none', async () => {
    await open(practised());

    expect(screen.queryByText('Your cards')).toBeNull();
  });

  it('marks the milestones that were reached and says how far the others are', async () => {
    await open(practised());

    expect(screen.getByRole('header', { name: 'Milestones' })).toBeTruthy();
    expect(screen.getByLabelText('First conversation: Reached')).toBeTruthy();
    expect(screen.getByLabelText('Five conversations: 3 of 5')).toBeTruthy();
    expect(screen.getByLabelText('An eight-minute conversation: Reached')).toBeTruthy();
    expect(screen.getByLabelText('An hour of talking: 20 of 60')).toBeTruthy();
    expect(screen.getByLabelText('First card saved: 0 of 1')).toBeTruthy();
  });

  it('says when progress cannot be loaded and loads it again', async () => {
    const api = practised();
    api.failNext('getProgress', 'network');
    await open(api);
    expect(
      screen.getByText('Can’t reach Konvami. Check your connection and try again.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByLabelText('3 conversations')).toBeTruthy();
  });

  it('reads progress for the device’s time zone', async () => {
    const api = await open(practised());

    expect(api.calls.filter(([method]) => method === 'getProgress')).toEqual([
      ['getProgress', 'Europe/Zurich'],
    ]);
  });

  it('sends someone who is not signed in to the start', async () => {
    await open(inApp(), { signedIn: false });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
