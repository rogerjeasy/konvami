import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { CoachSuggestion } from '@konvami/api-client';
import { createFakeApi, FAKE_PERSONAS, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { TodayScreen } from '@/screens/today';
import { CoachScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  useFocusEffect: () => {},
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

const LENA = FAKE_PERSONAS[0]!;
const NO_ACTION = {
  topic: null,
  sound: null,
  exam: null,
  partnerId: null,
  callId: null,
  importId: null,
  count: null,
};

function suggestion(id: string, changes: Partial<CoachSuggestion>): CoachSuggestion {
  return {
    id,
    day: '2026-10-09',
    kind: 'long_gap',
    evidence: { days: 6 },
    action: { ...NO_ACTION, type: 'free_talk', partnerId: LENA.id },
    minutes: 5,
    urgent: false,
    status: 'open',
    title: null,
    why: null,
    outcome: null,
    acted: null,
    ...changes,
  };
}

const LESSON = suggestion('s1', {
  kind: 'recurring_mistake',
  evidence: {
    category: 'case_dative',
    topic: 'dative',
    conversations: 3,
    outOf: 5,
    count: 4,
    said: 'mit der Bus',
    corrected: 'mit dem Bus',
  },
  action: { ...NO_ACTION, type: 'lesson', topic: 'dative', partnerId: LENA.id },
  minutes: 10,
});
const CARDS = suggestion('s2', {
  kind: 'cards_overdue',
  evidence: { due: 30, days: 4, count: 20 },
  action: { ...NO_ACTION, type: 'review_cards', count: 20 },
});

function coached(changes: Parameters<FakeApi['coaches']>[0]): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  api.coaches(changes);
  return api;
}

async function open(api: FakeApi) {
  await renderScreen(<CoachScreen />, { api, signedIn: true });
  await screen.findByText('Today');
}

beforeEach(() => jest.clearAllMocks());

describe('5.26 Coach', () => {
  it('words each suggestion from its evidence and starts it in one tap', async () => {
    const api = coached({ suggestions: [LESSON, CARDS] });
    await open(api);

    expect(screen.getByText('A short lesson on Dative')).toBeTruthy();
    expect(
      screen.getByText(
        'You said “mit der Bus” (right: “mit dem Bus”). It came up in 3 of your last 5 conversations.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Review 20 cards')).toBeTruthy();
    expect(screen.getByText('30 cards are waiting, the oldest for 4 days.')).toBeTruthy();

    fireEvent.press(screen.getAllByRole('button', { name: 'Start' })[0]!);

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/call/[personaId]',
      params: { personaId: LENA.id, practise: 'lesson:dative' },
    });
    await waitFor(() =>
      expect(api.calls).toContainEqual(['answerCoachSuggestion', 's1', { response: 'accepted' }]),
    );
    expect(await screen.findByText('Started')).toBeTruthy();
  });

  it('shows the model’s words when it wrote them', async () => {
    await open(
      coached({
        suggestions: [{ ...CARDS, title: 'Deine Karten warten', why: '30 Karten sind fällig.' }],
      }),
    );

    expect(screen.getByText('Deine Karten warten')).toBeTruthy();
    expect(screen.getByText('30 Karten sind fällig.')).toBeTruthy();
  });

  it('puts a suggestion off for today', async () => {
    const api = coached({ suggestions: [LESSON, CARDS] });
    await open(api);

    fireEvent.press(screen.getAllByRole('button', { name: 'Not now' })[0]!);

    await waitFor(() => expect(screen.queryByText('A short lesson on Dative')).toBeNull());
    expect(api.calls).toContainEqual(['answerCoachSuggestion', 's1', { response: 'snoozed' }]);
  });

  it('asks why a suggestion is not for the learner and remembers it', async () => {
    const api = coached({ suggestions: [CARDS] });
    await open(api);

    fireEvent.press(screen.getByRole('button', { name: 'Not for me' }));
    fireEvent.press(await screen.findByRole('button', { name: 'It takes too long' }));

    await waitFor(() =>
      expect(api.calls).toContainEqual([
        'answerCoachSuggestion',
        's2',
        { response: 'dismissed', reason: 'too_long' },
      ]),
    );
    await waitFor(() => expect(screen.queryByText('Review 20 cards')).toBeNull());
  });

  it('says what holds the learner back and what went well, never as an alarm', async () => {
    await open(
      coached({
        holdingBack: [
          {
            kind: 'weak_topic',
            evidence: { topic: 'dative', accuracy: 50, uses: 6 },
            trend: 'worse',
          },
          { kind: 'plan_missed', evidence: { days: 2 }, trend: null },
        ],
        goingWell: [
          { kind: 'pace_up', evidence: { before: 80, after: 95 }, trend: null },
          {
            kind: 'topic_improved',
            evidence: { topic: 'dative', was: 'practising', now: 'mostly_correct' },
            trend: null,
          },
        ],
      }),
    );

    expect(screen.getByText('Dative: 50% right so far')).toBeTruthy();
    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.getByText('2 planned days missed this week')).toBeTruthy();
    expect(screen.getByText('You speak faster: 95 words a minute, from 80')).toBeTruthy();
    expect(screen.getByText('Dative moved up to Mostly right')).toBeTruthy();
  });

  it('has a kind word when there is nothing to suggest yet', async () => {
    await open(coached({}));

    expect(
      screen.getByText(
        'Nothing to suggest right now. Have a conversation and your coach will find what helps you most.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Nothing stands out. Keep going as you are.')).toBeTruthy();
  });

  it('shows what came of earlier suggestions', async () => {
    await open(
      coached({
        history: [
          {
            ...LESSON,
            id: 'h1',
            day: '2026-10-07',
            status: 'accepted',
            outcome: 'resolved',
            acted: true,
          },
          { ...CARDS, id: 'h2', day: '2026-10-06', outcome: 'persists' },
        ],
      }),
    );

    expect(screen.getByText('Earlier suggestions')).toBeTruthy();
    expect(screen.getByText(/You did it/)).toBeTruthy();
    expect(screen.getByText(/Still worth working on/)).toBeTruthy();
  });

  it('says it is still putting the words together', async () => {
    await open(coached({ wording: 'pending', suggestions: [CARDS] }));

    expect(screen.getByText('Your coach is putting this into words…')).toBeTruthy();
  });
});

describe('The Coach on 5.1 Today', () => {
  it('follows the week’s plan with its first suggestion and leads to 5.26', async () => {
    const api = coached({ suggestions: [CARDS] });
    await renderScreen(<TodayScreen />, { api, signedIn: true });

    const card = await screen.findByText('Your coach suggests');
    expect(card).toBeTruthy();
    expect(screen.getByText('Review 20 cards')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'See all' }));
    expect(router.push).toHaveBeenCalledWith('/coach');
  });

  it('comes before the plan when it leads, as the main action', async () => {
    const exam = suggestion('s3', {
      kind: 'exam_near',
      evidence: { exam: 'goethe_b1', name: 'Goethe-Zertifikat B1', days: 10, count: 0 },
      action: { ...NO_ACTION, type: 'exam', exam: 'goethe_b1' },
      minutes: 10,
      urgent: true,
    });
    const api = coached({ suggestions: [exam], leads: true });
    await renderScreen(<TodayScreen />, { api, signedIn: true });

    const title = await screen.findByText('Simulate the Goethe-Zertifikat B1 speaking test');
    expect(title).toBeTruthy();
    expect(screen.getByText('Before today’s plan')).toBeTruthy();
    expect(
      screen.getByText('Your exam is in 10 days. A simulation now shows what to polish.'),
    ).toBeTruthy();
  });

  it('shows nothing when the coach has nothing to suggest', async () => {
    await renderScreen(<TodayScreen />, { api: coached({}), signedIn: true });

    await screen.findByText('This week');
    expect(screen.queryByText('Your coach suggests')).toBeNull();
  });
});
