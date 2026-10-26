import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { createFakeProfileDevice } from '@/test/fake-profile-device';
import { renderScreen } from '@/test/render';
import { LearnScreen } from '.';

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    setParams: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({})),
  useFocusEffect: jest.fn(),
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

  it('leads to the tutor, with or without cards', async () => {
    await open(inApp());

    const row = screen.getByRole('button', { name: 'Ask the tutor' });
    expect(row.props.accessibilityHint).toBe('Grammar, words, how to say something');
    await fireEvent.press(row);

    expect(router.push).toHaveBeenCalledWith('/tutor');
  });

  it('leads to the grammar map', async () => {
    await open(inApp());

    const row = screen.getByRole('button', { name: 'Grammar map' });
    expect(row.props.accessibilityHint).toBe('How well you use each part of the grammar');
    await fireEvent.press(row);

    expect(router.push).toHaveBeenCalledWith('/grammar');
  });

  it('says how many cards are due and starts the review', async () => {
    await open(await learning());

    expect(screen.getByText('3 cards to review')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Review now' }));

    expect(router.push).toHaveBeenCalledWith('/review');
  });

  it('starts a conversation built around the cards that are due', async () => {
    await open(await learning());

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Use them in a conversation' }),
    );

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/call/[personaId]',
      params: { personaId: expect.any(String), practise: 'words' },
    });
  });

  it('starts a review answered out loud', async () => {
    await open(await learning());

    await fireEvent.press(screen.getByRole('button', { name: 'Answer out loud' }));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/review', params: { aloud: '1' } });
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
    expect(screen.queryByRole('button', { name: 'Answer out loud' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use them in a conversation' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /, in 2 days$/ })).toHaveLength(3);
  });

  it('shows a card in full', async () => {
    await open(await learning());

    await fireEvent.press(screen.getByRole('button', { name: /^das Wochenende/ }));

    const sheet = within(screen.getByTestId('card-sheet'));
    // The word stands as the heading, its article said in words as well as in its colour.
    expect(screen.getByRole('header', { name: 'das Wochenende, neuter' })).toBeTruthy();
    expect(sheet.getByText('weekend')).toBeTruthy();
    expect(sheet.getByText('Wie war dein Wochenende?')).toBeTruthy();
    expect(sheet.getByText('Word · Not reviewed yet · Due now')).toBeTruthy();
  });

  it('shows a word’s forms once they are written down', async () => {
    await open(await learning());

    await fireEvent.press(screen.getByRole('button', { name: /^das Wochenende/ }));

    const sheet = within(screen.getByTestId('card-sheet'));
    expect(sheet.getByText('Plural')).toBeTruthy();
    expect(sheet.getByText('die Wochenenden')).toBeTruthy();
  });

  it('plays a card in the partner’s voice', async () => {
    const device = createFakeProfileDevice();
    const api = await learning();
    await renderScreen(<LearnScreen />, { api, signedIn: true, device });
    await waitFor(() => expect(screen.queryByText('Loading your cards')).toBeNull());
    await fireEvent.press(screen.getByRole('button', { name: /^das Wochenende/ }));

    await fireEvent.press(
      within(screen.getByTestId('card-sheet')).getByRole('button', { name: 'Listen' }),
    );

    await waitFor(() => expect(device.played).toEqual(['https://files.test/cards/card_1.mp3']));
  });

  it('opens the card a word of the day was about, and lets it go once closed', async () => {
    const api = await learning();
    jest.mocked(useLocalSearchParams).mockReturnValue({ card: 'card_1' });
    await open(api);

    const sheet = within(await screen.findByTestId('card-sheet'));
    expect(sheet.getByText('das Wochenende')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Close' })[0]!);

    expect(router.setParams).toHaveBeenCalledWith({ card: undefined });
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
