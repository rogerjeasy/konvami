import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { TutorScreen } from '.';

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
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

async function open(api: FakeApi = inApp()) {
  await renderScreen(<TutorScreen />, { api, signedIn: true });
  await screen.findByRole('header', { name: 'Ask the tutor' });
  await waitFor(() => expect(screen.queryByText('Opening your questions')).toBeNull());
}

const FIELD = 'Your question';

async function ask(question: string) {
  await fireEvent.changeText(screen.getByLabelText(FIELD), question);
  await fireEvent.press(screen.getByRole('button', { name: 'Ask' }));
}

describe('5.12 Ask the tutor', () => {
  it('has a question written elsewhere ready to send', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ question: 'How does “Dative” work?' });
    await open();

    expect(screen.getByLabelText(FIELD)).toHaveProp('value', 'How does “Dative” work?');
    expect(screen.getByRole('button', { name: 'Ask' })).toBeEnabled();
  });

  it('invites a first question', async () => {
    await open();

    expect(screen.getByText(/Ask anything about the language you’re learning/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
  });

  it('answers a question with examples and the topic it rests on', async () => {
    const api = inApp();
    await open(api);

    await ask('Why “dem” after “mit”?');

    expect(await screen.findByText('Why “dem” after “mit”?')).toBeTruthy();
    expect(
      screen.getByText('After “mit”, German always uses the dative: der Bus becomes dem Bus.'),
    ).toBeTruthy();
    expect(screen.getByText('Ich fahre mit dem Bus.')).toBeTruthy();
    expect(screen.getByText('I take the bus.')).toBeTruthy();
    expect(screen.getByText('Dative')).toBeTruthy();
    expect(screen.getByLabelText(FIELD)).toHaveProp('value', '');
    expect(api.calls).toContainEqual(['askTutor', 'Why “dem” after “mit”?']);
  });

  it('shows the questions asked before, newest first', async () => {
    const api = inApp();
    api.askedTutor([
      { question: 'Older question?', minutesAgo: 90 },
      { question: 'Newer question?', minutesAgo: 10 },
    ]);
    await open(api);

    const questions = screen.getAllByLabelText(/^You asked: /);
    expect(questions.map((q) => q.props.accessibilityLabel)).toEqual([
      'You asked: Newer question?',
      'You asked: Older question?',
    ]);
  });

  it('marks an answer the tutor is not sure of', async () => {
    const api = inApp();
    api.askedTutor([{ question: 'Is “wegen dem” wrong?', answer: { unsure: true } }]);
    await open(api);

    expect(screen.getByText('Not sure')).toBeTruthy();
    expect(screen.getByText(/The tutor isn’t sure about this one/)).toBeTruthy();
  });

  it('keeps the question when the tutor cannot answer, and says why', async () => {
    const api = inApp();
    await open(api);
    api.failNext('askTutor', 'unavailable');

    await ask('Warum?');

    expect(await screen.findByText(/The tutor couldn’t answer just now/)).toBeTruthy();
    expect(screen.getByLabelText(FIELD)).toHaveProp('value', 'Warum?');
  });

  it('says when the day’s questions are used up', async () => {
    const api = inApp();
    await open(api);
    api.failNext('askTutor', 'tutor_limit');

    await ask('Warum?');

    expect(await screen.findByText(/You’ve asked a lot today/)).toBeTruthy();
  });

  it('asks at once about a correction from a report', async () => {
    const api = inApp();
    const { id } = api.talked(0);
    api.reported(id);
    jest.mocked(useLocalSearchParams).mockReturnValue({ conversation: id, correction: '0' });

    await open(api);

    expect(
      await screen.findByText('Ich habe nach Berlin gefahren → Ich bin nach Berlin gefahren'),
    ).toBeTruthy();
    expect(api.calls).toContainEqual(['explainCorrection', id, 0]);
  });

  it('goes back to where the learner came from', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(router.back).toHaveBeenCalled();
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<TutorScreen />, { api: inApp() });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
