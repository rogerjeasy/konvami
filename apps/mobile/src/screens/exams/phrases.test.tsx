import { fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { ExamCentreScreen } from '.';
import { ExamPhrasesScreen } from './phrases';
import { ExamPrepScreen } from './prep';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
  useFocusEffect: jest.fn(),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ exam: 'goethe_b1' });
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

const phrasesRoute = { pathname: '/exams/[exam]/phrases', params: { exam: 'goethe_b1' } };
const SUGGEST = 'Ich schlage vor, dass wir uns am Samstag treffen.';

function preparing(): FakeApi {
  const api = createFakeApi();
  api.enterApp({ exam: { type: 'goethe', target_level: 'B1', date: '2027-04-15' } });
  return api;
}

describe('5.25 Phrase bank', () => {
  it('lists the phrases by what they do, with their meaning and level', async () => {
    const api = preparing();
    await renderScreen(<ExamPhrasesScreen />, { api, signedIn: true });

    expect(await screen.findByRole('header', { name: 'Useful phrases' })).toBeTruthy();
    expect(screen.getByText(/each part of Goethe-Zertifikat B1/)).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Making suggestions, 2' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Disagreeing politely, 1' })).toBeTruthy();
    expect(screen.getByText(SUGGEST)).toBeTruthy();
    expect(screen.getByText('I suggest we meet on Saturday.')).toBeTruthy();
    expect(screen.getByText('from A2')).toBeTruthy();
    expect(api.calls).toContainEqual(['getExamPhraseBank', 'goethe_b1']);
  });

  it('keeps a phrase in the phrasebook under the exam, then offers to hear it and make a card', async () => {
    const api = preparing();
    await renderScreen(<ExamPhrasesScreen />, { api, signedIn: true });
    await screen.findByText(SUGGEST);

    await fireEvent.press(
      screen.getByRole('button', { name: `Keep “${SUGGEST}” in my phrasebook` }),
    );

    expect(api.calls).toContainEqual([
      'savePhrase',
      {
        phrase: SUGGEST,
        meaning: 'I suggest we meet on Saturday.',
        situation: 'Goethe-Zertifikat B1',
      },
    ]);
    expect(await screen.findByText('In your phrasebook')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: `Learn “${SUGGEST}” as a card` }));
    expect(api.calls.some(([method]) => method === 'makePhraseCard')).toBe(true);
  });

  it('says when the bank cannot be found', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ exam: 'toefl' });
    await renderScreen(<ExamPhrasesScreen />, { api: preparing(), signedIn: true });

    expect(await screen.findByText('The phrases couldn’t be loaded.')).toBeTruthy();
  });

  it('is reached from the exam centre and from preparing a simulation', async () => {
    await renderScreen(<ExamCentreScreen />, { api: preparing(), signedIn: true });
    await fireEvent.press(await screen.findByRole('button', { name: 'All useful phrases' }));
    expect(router.push).toHaveBeenCalledWith(phrasesRoute);

    jest.mocked(router.push).mockClear();
    await renderScreen(<ExamPrepScreen />, { api: preparing(), signedIn: true });
    await fireEvent.press(await screen.findByRole('button', { name: 'All useful phrases' }));
    expect(router.push).toHaveBeenCalledWith(phrasesRoute);
  });
});
