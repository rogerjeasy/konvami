import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { STALE_AFTER_MS } from '@/practice/home-store';
import { getPreferences, setReminders } from '@/preferences';
import { DEFAULT_REMINDERS } from '@/reminders/schedule';
import {
  createFakeApi,
  FAKE_EXAM_WEEK,
  FAKE_NOW,
  FAKE_PERSONAS,
  type FakeApi,
} from '@/test/fake-api';
import { createFakeReminderDevice, type FakeReminderDevice } from '@/test/fake-reminder-device';
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

beforeEach(async () => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
  await setReminders(null);
});

const [LENA, JONAS] = FAKE_PERSONAS as [(typeof FAKE_PERSONAS)[0], (typeof FAKE_PERSONAS)[0]];
const call = (id: string, params: Record<string, string> = {}) => ({
  pathname: '/call/[personaId]',
  params: { personaId: id, ...params },
});

function inApp(options?: Parameters<FakeApi['enterApp']>[0]): FakeApi {
  const api = createFakeApi();
  api.enterApp(options);
  return api;
}

async function open(
  api: FakeApi = inApp(),
  now?: Date | (() => number),
  reminders?: FakeReminderDevice,
) {
  await renderScreen(<TodayScreen />, { api, now, reminders, signedIn: true });
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
    await fireEvent.press(screen.getByRole('button', { name: 'Start with Lena' }));

    // The first conversation of the week's plan, on its first topic.
    expect(router.push).toHaveBeenCalledWith(call(LENA.id, { practise: 'perfekt' }));
  });

  it('suggests the partner talked to last and says when', async () => {
    const api = inApp();
    api.talked(0, { daysAgo: 3 });
    api.talked(1, { daysAgo: 1 });
    await open(api);

    expect(screen.getByText('You last talked yesterday.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with Jonas' }));

    expect(router.push).toHaveBeenCalledWith(call(JONAS.id, { practise: 'perfekt' }));
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
    expect(screen.getByText('0 of 40 min this week · 0 of 4 days')).toBeTruthy();
  });

  it('shows the streak, the minutes and the days practised', async () => {
    const api = inApp();
    api.talked(0, { daysAgo: 1, minutes: 5 });
    api.talked(0, { minutes: 10 });
    await open(api);

    expect(screen.getByText('2-day streak')).toBeTruthy();
    // One line holds both numbers.
    expect(screen.getByText('15 of 40 min this week · 2 of 4 days')).toBeTruthy();
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

  it('says how many cards are waiting and opens the review', async () => {
    const api = inApp();
    await api.learning();
    await open(api);

    await fireEvent.press(screen.getByRole('button', { name: '3 cards to review' }));

    expect(router.push).toHaveBeenCalledWith('/review');
  });

  it('says nothing about cards when none is due', async () => {
    await open();

    expect(screen.queryByText(/to review/)).toBeNull();
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

    expect(await screen.findByRole('button', { name: 'Start with Lena' })).toBeTruthy();
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

    await waitFor(() => expect(screen.getByText(/10 of 40 min this week/)).toBeTruthy());
    expect(reads()).toBe(2);
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<TodayScreen />, { api: inApp() });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });

  describe('the week’s plan (spec §6.12)', () => {
    it('shows what today’s conversations work on, the cards and how long it all takes', async () => {
      const api = inApp();
      api.planned({
        today: [
          { kind: 'review', minutes: 5, topic: null, scenario: null, exam: null },
          { kind: 'role_play', minutes: 10, topic: 'dative', scenario: 'doctor', exam: null },
        ],
        todayCards: 6,
      });
      await open(api);

      expect(screen.getByRole('header', { name: 'Today · 15 min · 6 cards' })).toBeTruthy();
      expect(screen.getByText('5 min · Review conversation')).toBeTruthy();
      expect(screen.getByText('Using the words that are due')).toBeTruthy();
      expect(screen.getByText('10 min · Role-play: At the doctor’s')).toBeTruthy();
      expect(screen.getByText('Focus: Dative')).toBeTruthy();
    });

    it.each([
      [
        { kind: 'review', minutes: 5, topic: null, scenario: null, exam: null },
        { practise: 'words' },
      ],
      [
        { kind: 'role_play', minutes: 10, topic: 'dative', scenario: 'doctor', exam: null },
        { scenario: 'doctor', practise: 'dative' },
      ],
    ] as const)('starts the next planned conversation in one tap', async (session, params) => {
      const api = inApp();
      api.planned({ today: [session] });
      await open(api);

      await fireEvent.press(screen.getByRole('button', { name: 'Start with Lena' }));

      expect(router.push).toHaveBeenCalledWith(call(LENA.id, params));
    });

    it('says why today has a little more after missed days', async () => {
      const api = inApp();
      api.planned({ reason: 'missed', missed: ['2026-10-06', '2026-10-07'] });
      await open(api);

      expect(
        screen.getByText('You missed Tuesday and Wednesday, so today has a little more.'),
      ).toBeTruthy();
    });

    it('offers a conversation all the same once today’s plan is done', async () => {
      const api = inApp();
      api.planned({ today: [], reason: 'today_done' });
      await open(api);

      expect(screen.getByText('That’s today’s plan done. See you tomorrow!')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Talk with Lena' }));

      expect(router.push).toHaveBeenCalledWith(call(LENA.id));
    });

    describe('with an exam ahead (spec §6.13)', () => {
      const SIMULATION = {
        kind: 'exam',
        minutes: 10,
        topic: null,
        scenario: null,
        exam: 'goethe_b1',
      } as const;
      const GOETHE = { type: 'goethe', target_level: 'B1', date: '2026-11-13' };

      it('plans a simulation and prepares it in one tap', async () => {
        const api = inApp({ exam: GOETHE });
        api.planned({ today: [SIMULATION], exam: FAKE_EXAM_WEEK });
        await open(api);

        expect(screen.getByText('10 min · Exam simulation')).toBeTruthy();
        expect(screen.getByText('The speaking test of the Goethe-Zertifikat B1')).toBeTruthy();
        await fireEvent.press(screen.getByRole('button', { name: 'Prepare the simulation' }));

        expect(router.push).toHaveBeenCalledWith({
          pathname: '/exams/[exam]',
          params: { exam: 'goethe_b1' },
        });
      });

      it('names the weakest part the simulation will show again', async () => {
        const api = inApp({ exam: GOETHE });
        api.planned({
          today: [SIMULATION],
          exam: { ...FAKE_EXAM_WEEK, weakest: { number: 2, kind: 'present_topic' } },
        });
        await open(api);

        expect(screen.getAllByText('Weakest lately: Part 2 · Present a topic')).toHaveLength(2);
      });

      it('says on the exam how many simulations the week has, and why', async () => {
        const api = inApp({ exam: GOETHE });
        api.planned({
          exam: { ...FAKE_EXAM_WEEK, pace: 'final', wanted: 2, simulations: 2, done: 1 },
        });
        await open(api);

        expect(screen.getByText('Simulations this week: 1 of 2')).toBeTruthy();
        expect(screen.getByText('Your exam is close: two this week.')).toBeTruthy();
        await fireEvent.press(screen.getByRole('button', { name: 'Open the exam centre' }));

        expect(router.push).toHaveBeenCalledWith('/exams');
      });

      it.each([
        [{ pace: 'first' }, 'A first simulation shows where you stand.'],
        [{ pace: 'weekly' }, 'One a week in the last two months before your exam.'],
        [
          { pace: 'fortnightly', simulations: 0, wanted: 0 },
          'One every two weeks while your exam is more than two months away. The next one is next week.',
        ],
        [
          { pace: 'final', wanted: 2, simulations: 1 },
          'Your weekly goal has room for one: each simulation takes a whole 10-minute call.',
        ],
        [
          { simulations: 0 },
          'Your weekly goal has no room for one: a simulation takes a whole 10-minute call, more than half of it.',
        ],
      ] as const)('says why the week has the simulations it has', async (changes, why) => {
        const api = inApp({ exam: GOETHE });
        api.planned({ exam: { ...FAKE_EXAM_WEEK, ...changes } });
        await open(api);

        expect(screen.getByText(why)).toBeTruthy();
      });
    });

    it('names the week’s topics, says when the voice minutes shaped it, and opens the goals', async () => {
      const api = inApp();
      api.planned({ capped: true, minutes: 60 });
      await open(api);

      expect(
        screen.getByText(
          'This week’s focus: Perfekt, Dative, and Prepositions with accusative or dative',
        ),
      ).toBeTruthy();
      expect(screen.getByText('Planned to fit your 60 voice minutes.')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Change my weekly goal' }));

      expect(router.push).toHaveBeenCalledWith('/account/goals');
    });
  });

  describe('reminders (spec §6.18)', () => {
    // A learner who has talked once: reminders are worth offering.
    function talkedOnce() {
      const api = inApp();
      api.talked(0, { daysAgo: 1 });
      return api;
    }

    it('are offered after the first conversation, and the phone is asked only on yes', async () => {
      const device = createFakeReminderDevice('undetermined', 'granted');
      await open(talkedOnce(), undefined, device);

      expect(
        screen.getByRole('header', { name: 'A reminder on your practice days?' }),
      ).toBeTruthy();
      expect(device.asked).toBe(0);
      await fireEvent.press(screen.getByRole('button', { name: 'Remind me' }));

      await waitFor(() => expect(device.scheduled.length).toBeGreaterThan(0));
      expect(device.asked).toBe(1);
      expect(getPreferences().reminders).toEqual(DEFAULT_REMINDERS);
      expect(device.channel).toBe('Practice reminders');
      // From the partner, at the learner's time: today's plan, then the planned days ahead.
      const [first, second] = device.scheduled;
      expect(first?.title).toBe('Lena');
      expect(first?.body).toBe('Got 10 min? Today’s plan is ready.');
      expect(second?.body).toBe('Got a few minutes? Your plan for today is ready.');
      expect([first?.at.getHours(), first?.at.getMinutes()]).toEqual([18, 0]);
      expect(
        screen.queryByRole('header', { name: 'A reminder on your practice days?' }),
      ).toBeNull();
    });

    it('take no for an answer, and are not offered again', async () => {
      const device = createFakeReminderDevice();
      await open(talkedOnce(), undefined, device);

      await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

      expect(device.asked).toBe(0);
      expect(getPreferences().reminders).toEqual({ ...DEFAULT_REMINDERS, on: false });
      expect(screen.queryByRole('button', { name: 'Remind me' })).toBeNull();
    });

    it('are turned off when the phone says no', async () => {
      const device = createFakeReminderDevice('undetermined', 'denied');
      await open(talkedOnce(), undefined, device);

      await fireEvent.press(screen.getByRole('button', { name: 'Remind me' }));

      await waitFor(() => expect(getPreferences().reminders?.on).toBe(false));
      expect(device.scheduled).toEqual([]);
    });

    it('are not offered before a first conversation, nor where the phone refuses them', async () => {
      await open(inApp(), undefined, createFakeReminderDevice());
      expect(screen.queryByRole('button', { name: 'Remind me' })).toBeNull();
    });

    it('are not offered where the phone already refuses them', async () => {
      await open(talkedOnce(), undefined, createFakeReminderDevice('denied'));
      expect(screen.queryByRole('button', { name: 'Remind me' })).toBeNull();
    });

    it('follow today’s plan once chosen: today’s minutes, from the partner', async () => {
      await setReminders(DEFAULT_REMINDERS);
      const device = createFakeReminderDevice('granted');
      // Friday at 9:00: today's reminder at 18:00 is still ahead.
      await open(inApp(), new Date(2026, 9, 9, 9, 0), device);

      await waitFor(() => expect(device.scheduled.length).toBeGreaterThan(0));
      expect(device.scheduled[0]).toMatchObject({
        id: 'reminder-2026-10-09',
        title: 'Lena',
        body: 'Got 10 min? Today’s plan is ready.',
      });
    });
  });
});
