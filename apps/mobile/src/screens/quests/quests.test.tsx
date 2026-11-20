import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { setReminders } from '@/preferences';
import { createFakeApi, FAKE_PERSONAS, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { TodayScreen } from '@/screens/today';
import { StreakTile } from '@/screens/today/week-card';
import { QuestsScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  useFocusEffect: () => {},
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

const [LENA] = FAKE_PERSONAS as [(typeof FAKE_PERSONAS)[0]];

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

const QUESTS = {
  week: '2026-10-05',
  allDone: false,
  quests: [
    { kind: 'talk_days' as const, target: 3, progress: 1, done: false, doneAt: null },
    {
      kind: 'pen_pal' as const,
      target: 1,
      progress: 1,
      done: true,
      doneAt: '2026-10-07T10:00:00Z',
    },
    { kind: 'sound_drills' as const, target: 3, progress: 0, done: false, doneAt: null },
  ],
};

async function openToday(api: FakeApi) {
  await renderScreen(<TodayScreen />, { api, signedIn: true });
  await screen.findByText('This week');
}

describe('5.27 This week’s quests', () => {
  it('lists the three quests with how far each is, and leads to where one is done', async () => {
    const api = inApp();
    api.motivates({ quests: QUESTS });
    await renderScreen(<QuestsScreen />, { api, signedIn: true });

    expect(await screen.findByRole('header', { name: 'This week’s quests' })).toBeTruthy();
    expect(screen.getByText('1 of 3 done this week')).toBeTruthy();
    expect(screen.getByText('Speak on 3 days')).toBeTruthy();
    expect(screen.getByText('1 of 3')).toBeTruthy();
    expect(screen.getByText('Answer a voice note')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();

    // The open quests offer a way in; the done one does not.
    const starts = screen.getAllByRole('button', { name: 'Start' });
    expect(starts).toHaveLength(2);
    fireEvent.press(starts[1]!);
    expect(router.push).toHaveBeenCalledWith('/pronunciation');
  });

  it('says so when all three are done', async () => {
    const api = inApp();
    api.motivates({
      quests: {
        ...QUESTS,
        allDone: true,
        quests: QUESTS.quests.map((quest) => ({ ...quest, done: true, progress: quest.target })),
      },
    });
    await renderScreen(<QuestsScreen />, { api, signedIn: true });

    expect(await screen.findByText('All three done. Nicely spoken!')).toBeTruthy();
  });
});

describe('5.1 Today: motivation', () => {
  it('shows the week’s quests on the butter block, with the way to 5.27', async () => {
    const api = inApp();
    api.motivates({ quests: QUESTS });
    await openToday(api);

    expect(await screen.findByText('Speak on 3 days')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'See this week’s quests' }));
    expect(router.push).toHaveBeenCalledWith('/quests');
  });

  it('offers to pick up a missed planned day with a partner, never as a loss', async () => {
    const api = inApp();
    api.motivates({
      streak: {
        days: 4,
        longest: 6,
        plannedToday: true,
        spokeToday: false,
        repair: { missed: '2026-10-08', until: '2026-10-10' },
      },
    });
    await openToday(api);

    expect(await screen.findByRole('header', { name: 'Pick it up with Lena?' })).toBeTruthy();
    expect(screen.getByText(/keep your 4-day streak going/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Talk with Lena' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/call/[personaId]',
      params: { personaId: LENA.id },
    });
  });

  it('welcomes a learner back with what the partner remembers, and pauses reminders', async () => {
    const api = inApp();
    api.motivates({
      welcomeBack: {
        days: 9,
        partnerId: LENA.id,
        question: 'How did the interview go?',
      },
    });
    await openToday(api);

    expect(await screen.findByText('How did the interview go?')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Pause reminders for a month' }));
    expect(await screen.findByText(/Reminders are paused until/)).toBeTruthy();
    expect(api.calls).toContainEqual(['pauseReminders', 30]);

    fireEvent.press(screen.getByRole('button', { name: 'Resume reminders' }));
    expect(await screen.findByRole('button', { name: 'Pause reminders for a month' })).toBeTruthy();
  });

  it('shows Monday’s recap until it is closed', async () => {
    const api = inApp();
    api.motivates({
      freshStart: true,
      recap: {
        week: '2026-09-28',
        minutes: 25,
        conversations: 3,
        speakingDays: 2,
        questsDone: 2,
        questsTotal: 3,
        milestones: ['week_streak'],
        improved: ['case_dative'],
      },
    });
    await openToday(api);

    expect(await screen.findByText('New week, new plan.')).toBeTruthy();
    expect(screen.getByText(/25 minutes/)).toBeTruthy();
    expect(screen.getByText('2 of 3 quests done')).toBeTruthy();
    expect(screen.getByText('New: Seven days in a row')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText('New week, new plan.')).toBeNull());
  });

  it('celebrates a moment once and marks it celebrated', async () => {
    const api = inApp();
    api.motivates({
      quests: QUESTS,
      celebrations: [{ kind: 'quest', id: 'pen_pal', at: '2026-10-07T10:00:00Z' }],
    });
    await openToday(api);

    const sheet = await screen.findByText('Quest done!');
    expect(sheet).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Lovely' }));

    await waitFor(() => expect(api.calls).toContainEqual(['markCelebrated', 'quest', 'pen_pal']));
    await waitFor(() => expect(screen.queryByText('Quest done!')).toBeNull());
  });

  it('tells the learner a rest day keeps their streak', async () => {
    const week = Array.from({ length: 7 }, (_, i) => ({
      day: `2026-10-0${i + 5}`,
      seconds: i < 3 ? 300 : 0,
    }));
    const activity = {
      today: '2026-10-08',
      streakDays: 3,
      practisedToday: false,
      todaySeconds: 0,
      weekSeconds: 900,
      week,
      conversations: 3,
      seconds: 900,
    };
    await renderScreen(<StreakTile activity={activity} restDay />, { signedIn: true });

    expect(screen.getByText('A rest day in your plan. Your streak is safe.')).toBeTruthy();
    expect(screen.queryByText('Talk today to keep your streak going.')).toBeNull();
  });
});
