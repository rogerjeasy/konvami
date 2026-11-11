import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { PhrasebookScreen } from '.';

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

async function open(api: FakeApi = inApp()) {
  await renderScreen(<PhrasebookScreen />, { api, signedIn: true });
  await screen.findByRole('header', { name: 'Phrasebook' });
  await waitFor(() => expect(screen.queryByText('Opening your phrasebook')).toBeNull());
  return api;
}

const FIELD = 'What do you need to say?';

async function suggest(situation: string) {
  await fireEvent.changeText(screen.getByLabelText(FIELD), situation);
  await fireEvent.press(screen.getByRole('button', { name: 'Suggest phrases' }));
}

describe('5.19 Phrasebook', () => {
  it('keeps a personally entered phrase without asking the AI', async () => {
    const api = await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Add your own phrase' }));
    expect(screen.getByRole('button', { name: 'Save phrase' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Phrase'), '  Guten Abend.  ');
    await fireEvent.changeText(screen.getByLabelText('Meaning'), ' Good evening. ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save phrase' }));
    expect(await screen.findByText('Guten Abend.')).toBeTruthy();
    expect(api.calls).toContainEqual([
      'savePhrase',
      {
        phrase: 'Guten Abend.',
        meaning: 'Good evening.',
        situation: null,
      },
    ]);
    expect(api.calls.some(([method]) => method === 'suggestPhrases')).toBe(false);
  });
  it('invites a first need, with nothing made up', async () => {
    await open();

    expect(screen.getByText('Your phrases will live here')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Suggest phrases' })).toBeDisabled();
  });

  it('suggests phrases with their meaning and keeps nothing until chosen', async () => {
    const api = await open();

    await suggest('Making a doctor’s appointment');

    expect(await screen.findByText('Ich hätte gern einen Termin.')).toBeTruthy();
    expect(screen.getByText('I would like an appointment.')).toBeTruthy();
    expect(screen.getByText('For: Making a doctor’s appointment')).toBeTruthy();
    expect(api.calls).toContainEqual(['suggestPhrases', 'Making a doctor’s appointment']);
    expect(api.calls.some(([method]) => method === 'savePhrase')).toBe(false);
  });

  it('keeps a suggested phrase and lists it among the learner’s phrases', async () => {
    const api = await open();
    await suggest('Making a doctor’s appointment');

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Keep “Ich hätte gern einen Termin.”' }),
    );

    expect(await screen.findByText('Your phrases')).toBeTruthy();
    expect(api.calls).toContainEqual([
      'savePhrase',
      {
        phrase: 'Ich hätte gern einen Termin.',
        meaning: 'I would like an appointment.',
        situation: 'Making a doctor’s appointment',
      },
    ]);
    expect(screen.getByText('Kept')).toBeTruthy();
  });

  it('lists phrases kept earlier and makes a flashcard of one', async () => {
    const api = inApp();
    api.keptPhrases([{ phrase: 'Guten Tag.', meaning: 'Hello.' }]);
    await open(api);

    expect(screen.getByText('Guten Tag.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Learn “Guten Tag.” as a card' }));

    expect(await screen.findByText('In your cards')).toBeTruthy();
    expect(api.calls).toContainEqual(['makePhraseCard', 'phrase_1']);
  });

  it('removes a phrase', async () => {
    const api = inApp();
    api.keptPhrases([{ phrase: 'Guten Tag.', meaning: 'Hello.' }]);
    await open(api);

    await fireEvent.press(screen.getByRole('button', { name: 'Remove “Guten Tag.”' }));

    await waitFor(() => expect(screen.queryByText('Guten Tag.')).toBeNull());
    expect(screen.getByText('Your phrases will live here')).toBeTruthy();
  });

  it('says so when the day’s suggestions are used up', async () => {
    const api = await open();
    api.failNext('suggestPhrases', 'suggestion_limit');

    await suggest('At the bakery');

    expect(await screen.findByText(/Suggestions are back tomorrow/)).toBeTruthy();
  });
});
