import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { STALE_AFTER_MS } from '@/practice/home-store';
import { createFakeApi, FAKE_NOW, FAKE_PERSONAS, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { TodayScreen } from '.';

// What the screen does each time it comes back into view; a test calls it to "come back".
let onFocus: () => void = () => {};

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (effect: () => void) => {
    onFocus = effect;
  },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

const [LENA, JONAS] = FAKE_PERSONAS as [(typeof FAKE_PERSONAS)[0], (typeof FAKE_PERSONAS)[0]];
const call = (id: string) => ({ pathname: '/call/[personaId]', params: { personaId: id } });

function inApp(options?: Parameters<FakeApi['enterApp']>[0]): FakeApi {
  const api = createFakeApi();
  api.enterApp(options);
  return api;
}

async function open(api: FakeApi = inApp(), now?: Date | (() => number)) {
  await renderScreen(<TodayScreen />, { api, now, signedIn: true });
  // The week is there once the day has loaded.
  await screen.findByText('This week');
  return api;
}

describe('5.1 Today', () => {
  it.each([
    [new Date(2026, 9, 9, 8, 30), 'Good morning, Amara'],
    [new Date(2026, 9, 9, 14, 0), 'Good afternoon, Amara'],
    [new Date(2026, 9, 9, 21, 15), 'Good evening, Amara'],
  ])('greets the learner by name for the time of day', async (now, greeting) => {
    await open(inApp(), now);

    expect(screen.getByRole('header', { name: greeting })).toBeTruthy();
  });

  it('says which day it is', async () => {
    await open(inApp(), new Date(2026, 9, 9, 8, 30));

    expect(screen.getByText(/Friday,? 9 October|Friday, October 9/)).toBeTruthy();
  });

  it('offers a new learner their first conversation in one tap', async () => {
    await open();

    expect(screen.getByText('Your first conversation is waiting.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Talk with Lena' }));

    expect(router.push).toHaveBeenCalledWith(call(LENA.id));
  });

  it('suggests the partner talked to last and says when', async () => {
    const api = inApp();
    api.talked(0, { daysAgo: 3 });
    api.talked(1, { daysAgo: 1 });
    await open(api);

    expect(screen.getByText('You last talked yesterday.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Talk with Jonas' }));

    expect(router.push).toHaveBeenCalledWith(call(JONAS.id));
  });

  it('leads to the other partners', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Talk with someone else' }));

    expect(router.navigate).toHaveBeenCalledWith('/talk');
  });

  it('shows a new learner an empty week and what starts a streak', async () => {
    await open();

    expect(screen.getByText('Your first conversation starts your streak.')).toBeTruthy();
    expect(screen.getByLabelText('Friday: today, not practised yet')).toBeTruthy();
    expect(screen.getByLabelText('Monday: no practice')).toBeTruthy();
    expect(screen.getByLabelText('Sunday: still to come')).toBeTruthy();
    expect(screen.queryByText(/-day streak/)).toBeNull();
    expect(screen.queryByText(/min this week/)).toBeNull();
  });

  it('shows the streak, the minutes and the days practised', async () => {
    const api = inApp();
    api.talked(0, { daysAgo: 1, minutes: 5 });
    api.talked(0, { minutes: 10 });
    await open(api);

    expect(screen.getByText('2-day streak')).toBeTruthy();
    // One line holds both numbers.
    expect(screen.getByText('15 min this week · 10 min today')).toBeTruthy();
    expect(screen.getByLabelText('Thursday: practised')).toBeTruthy();
    expect(screen.getByLabelText('Friday: practised')).toBeTruthy();
    expect(screen.getByLabelText('Wednesday: no practice')).toBeTruthy();
  });

  it('asks for a conversation today while yesterday’s streak is still open', async () => {
    const api = inApp();
    api.talked(0, { daysAgo: 1 });
    await open(api);

    expect(screen.getByText('1-day streak')).toBeTruthy();
    expect(screen.getByText('Talk today to keep your streak going.')).toBeTruthy();
  });

  it('invites a learner whose streak has ended to start a new one', async () => {
    const api = inApp();
    api.talked(0, { daysAgo: 3 });
    await open(api);

    expect(screen.queryByText(/-day streak/)).toBeNull();
    expect(screen.getByText('A few minutes today start a new streak.')).toBeTruthy();
  });

  it('shows the level practice starts at and that the learner gave it', async () => {
    await open();

    expect(screen.getByText('A2 · Elementary')).toBeTruthy();
    expect(screen.getByText('You told me')).toBeTruthy();
    expect(screen.queryByLabelText(/^Speaking: /)).toBeNull();
    expect(screen.queryByText('Let’s polish this')).toBeNull();
  });

  it('shows what the placement test measured and what to polish', async () => {
    await open(inApp({ measured: true }));

    expect(screen.getByText('B1 · Intermediate')).toBeTruthy();
    expect(screen.getByText('Measured')).toBeTruthy();
    expect(screen.getByLabelText('Speaking: B1')).toBeTruthy();
    expect(screen.getByLabelText('Grammar: A2')).toBeTruthy();
    expect(screen.getByText('Let’s polish this')).toBeTruthy();
    expect(screen.getByText('Dative after “mit”')).toBeTruthy();
  });

  it('says that what to polish comes from the placement test, until there is a report', async () => {
    await open(inApp({ measured: true }));

    expect(
      screen.getByText('From your placement test. Your partners bring these up as you talk.'),
    ).toBeTruthy();
  });

  it('shows the next steps of the last report as what to polish', async () => {
    const api = inApp({ measured: true });
    api.reported(api.talked(0).id);
    await open(api);

    expect(
      screen.getByText('From your last conversation. Your partners bring these up as you talk.'),
    ).toBeTruthy();
    expect(screen.getByText('Verb at the end after “weil”')).toBeTruthy();
    expect(screen.queryByText('Dative after “mit”')).toBeNull();
  });

  it('counts down to the exam', async () => {
    await open(inApp({ exam: { type: 'goethe', target_level: 'B1', date: '2026-12-01' } }));

    expect(screen.getByText('Goethe-Zertifikat B1')).toBeTruthy();
    expect(screen.getByText('In 53 days')).toBeTruthy();
    expect(screen.getByText('December 1, 2026')).toBeTruthy();
  });

  it('shows an exam without a date without a countdown', async () => {
    await open(inApp({ exam: { type: 'other', target_level: null, date: null } }));

    expect(screen.getByText('Your exam')).toBeTruthy();
    expect(screen.getByText('No date set yet')).toBeTruthy();
  });

  it('shows no exam to someone who has none', async () => {
    await open();

    expect(screen.queryByText('Your exam')).toBeNull();
  });

  it('lists the latest conversations and opens one', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_old', daysAgo: 2, minutes: 4 });
    api.talked(1, { id: 'rtc_new', minutes: 8 });
    await open(api);

    expect(screen.getByRole('header', { name: 'Recent conversations' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Jonas, today, 8 min' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/conversations/[id]',
      params: { id: 'rtc_new' },
    });
    expect(screen.getByRole('button', { name: 'Lena, 2 days ago, 4 min' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'See all' }));
    expect(router.navigate).toHaveBeenCalledWith('/library');
  });

  it('has no list of conversations before the first one', async () => {
    await open();

    expect(screen.queryByText('Recent conversations')).toBeNull();
  });

  it('opens the account', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Your account' }));

    expect(router.push).toHaveBeenCalledWith('/account');
  });

  it('shows the learner’s photo on the way to the account, once they have one', async () => {
    const api = inApp();
    api.havePicture();

    await open(api);

    // The photo is decorative; the button around it is what a screen reader meets.
    const photo = await screen.findByTestId('user-photo-image', { includeHiddenElements: true });
    expect(photo).toHaveProp('source', {
      uri: 'https://files.test/users/amara/picture/earlier.jpg',
    });
    expect(screen.getByRole('button', { name: 'Your account' })).toBeTruthy();
  });

  it('says so when the day cannot be loaded and tries again', async () => {
    const api = inApp();
    api.failNext('getHome', 'unknown');
    await renderScreen(<TodayScreen />, { api, signedIn: true });

    expect(await screen.findByText('Your day couldn’t be loaded.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Talk with Lena' })).toBeTruthy();
  });

  it('reads the day again when the learner comes back after a while', async () => {
    const clock = { now: Date.parse(FAKE_NOW) };
    const api = await open(inApp(), () => clock.now);
    const reads = () => api.calls.filter(([method]) => method === 'getHome').length;
    expect(reads()).toBe(1);

    await act(async () => onFocus());
    expect(reads()).toBe(1);

    api.talked(0, { minutes: 10 });
    clock.now += STALE_AFTER_MS;
    await act(async () => onFocus());

    await waitFor(() => expect(screen.getByText(/10 min today/)).toBeTruthy());
    expect(reads()).toBe(2);
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<TodayScreen />, { api: inApp() });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
