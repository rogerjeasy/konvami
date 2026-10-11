import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { LearnScreen } from '.';

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

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

/** A learner with three cards, all due: two words and a correction. */
async function learning(): Promise<FakeApi> {
  const api = inApp();
  await api.learning();
  return api;
}

describe('5.7 Learn', () => {
  async function open(api: FakeApi) {
    await renderScreen(<LearnScreen />, { api, signedIn: true });
    await waitFor(() => expect(screen.queryByText('Loading your cards')).toBeNull());
    return api;
  }

  const removed = (api: FakeApi) => api.calls.filter(([method]) => method === 'removeCard');

  it('tells a learner without cards where cards come from, and shows none made up', async () => {
    await open(inApp());

    expect(screen.getByRole('header', { name: 'Learn' })).toBeTruthy();
    expect(screen.getByText('Your cards will live here')).toBeTruthy();
    expect(screen.queryByText(/\d/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Start talking' }));

    expect(router.navigate).toHaveBeenCalledWith('/talk');
  });

  it('says how many cards are due and starts the review', async () => {
    await open(await learning());

    expect(screen.getByText('3 cards to review')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Review now' }));

    expect(router.push).toHaveBeenCalledWith('/review');
  });

  it('lists the cards newest first, with when each is due', async () => {
    await open(await learning());

    expect(screen.getByRole('header', { name: 'Your cards, 3' })).toBeTruthy();
    const rows = screen.getAllByRole('button', { name: /, due now$/ });
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'Ich habe nach Berlin gefahren: Ich bin nach Berlin gefahren, due now',
      'die Ausstellung: exhibition, due now',
      'das Wochenende: weekend, due now',
    ]);
  });

  it('says when the next card comes back once everything is reviewed', async () => {
    const api = await learning();
    for (const id of ['card_1', 'card_2', 'card_3']) await api.reviewCard(id, 'good');
    await open(api);

    expect(screen.getByText('All caught up')).toBeTruthy();
    expect(screen.getByText('Your next card comes back in 2 days.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review now' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /, in 2 days$/ })).toHaveLength(3);
  });

  it('shows a card in full', async () => {
    await open(await learning());

    await fireEvent.press(screen.getByRole('button', { name: /^das Wochenende/ }));

    const sheet = within(screen.getByTestId('card-sheet'));
    // The sheet's title is the word itself.
    expect(screen.getByRole('header', { name: 'das Wochenende' })).toBeTruthy();
    expect(sheet.getByText('weekend')).toBeTruthy();
    expect(sheet.getByText('Wie war dein Wochenende?')).toBeTruthy();
    expect(sheet.getByText('Word · Not reviewed yet · Due now')).toBeTruthy();
  });

  it('shows a correction as what was said and how it is right', async () => {
    await open(await learning());

    await fireEvent.press(screen.getByRole('button', { name: /^Ich habe nach Berlin gefahren/ }));

    const sheet = within(screen.getByTestId('card-sheet'));
    expect(sheet.getByText('You said')).toBeTruthy();
    expect(sheet.getByText('Ich bin nach Berlin gefahren')).toBeTruthy();
    expect(
      sheet.getByText('Verbs of movement such as “fahren” form the Perfekt with “sein”.'),
    ).toBeTruthy();
  });

  it('removes a card', async () => {
    const api = await open(await learning());
    await fireEvent.press(screen.getByRole('button', { name: /^das Wochenende/ }));

    await fireEvent.press(screen.getByRole('button', { name: 'Remove this card' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^das Wochenende/ })).toBeNull(),
    );
    expect(removed(api)).toEqual([['removeCard', 'card_1']]);
    expect(screen.getByText('2 cards to review')).toBeTruthy();
    expect(screen.queryByTestId('card-sheet')).toBeNull();
  });

  it('says so when a card could not be removed, and keeps it', async () => {
    const api = await open(await learning());
    await fireEvent.press(screen.getByRole('button', { name: /^das Wochenende/ }));
    api.failNext('removeCard', 'network');

    await fireEvent.press(screen.getByRole('button', { name: 'Remove this card' }));

    expect(await screen.findByText('This card couldn’t be removed. Try again.')).toBeTruthy();
    expect(screen.getByText('3 cards to review')).toBeTruthy();
  });

  it('says when the cards cannot be loaded and loads them again', async () => {
    const api = await learning();
    api.failNext('getCards', 'network');
    await open(api);
    expect(
      screen.getByText('Can’t reach Konvami. Check your connection and try again.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('3 cards to review')).toBeTruthy();
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<LearnScreen />, { api: inApp() });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
