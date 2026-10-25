import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { ReviewScreen } from '.';

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
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

/** A learner with three cards due: "das Wochenende", "die Ausstellung" and a correction. */
async function learning(): Promise<FakeApi> {
  const api = createFakeApi();
  api.enterApp();
  await api.learning();
  return api;
}

async function open(api: FakeApi, { signedIn = true } = {}) {
  await renderScreen(<ReviewScreen />, { api, signedIn });
  if (signedIn) await waitFor(() => expect(screen.queryByText('Getting your cards')).toBeNull());
  return api;
}

const reviews = (api: FakeApi) =>
  api.calls.filter(([method]) => method === 'reviewCard').map(([, id, rating]) => [id, rating]);

/** Shows the answer of the card on screen and rates it. */
async function answer(rating: 'Again' | 'Hard' | 'Good' | 'Easy') {
  await fireEvent.press(screen.getByRole('button', { name: 'Show answer' }));
  await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${rating},`) }));
}

describe('5.11 Review', () => {
  it('shows the first card with its answer hidden, and how far along the learner is', async () => {
    await open(await learning());

    expect(screen.getByRole('progressbar', { name: 'Card 1 of 3' })).toBeTruthy();
    expect(screen.getByText('What does it mean?')).toBeTruthy();
    // The article in its gender's colour, and in words for a screen reader.
    expect(screen.getByRole('header', { name: 'das Wochenende, neuter' })).toBeTruthy();
    expect(screen.queryByText('weekend')).toBeNull();
    expect(screen.queryByText('die Wochenenden')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Good/ })).toBeNull();
  });

  it('shows the answer, where the word came from and when each rating brings it back', async () => {
    await open(await learning());

    await fireEvent.press(screen.getByRole('button', { name: 'Show answer' }));

    expect(screen.getByText('weekend')).toBeTruthy();
    expect(screen.getByText('Wie war dein Wochenende?')).toBeTruthy();
    expect(screen.getByText('How well did you know it?')).toBeTruthy();
    for (const label of ['Again, 10 min', 'Hard, 1 day', 'Good, 2 days', 'Easy, 8 days']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull();
  });

  it('shows a word’s forms with the answer, and plays it', async () => {
    await open(await learning());

    await fireEvent.press(screen.getByRole('button', { name: 'Show answer' }));

    expect(screen.getByText('die Wochenenden')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Listen' })).toBeTruthy();
  });

  it('stores each rating and moves on to the next card', async () => {
    const api = await open(await learning());

    await answer('Good');

    expect(await screen.findByRole('header', { name: 'die Ausstellung' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Card 2 of 3' })).toBeTruthy();
    expect(reviews(api)).toEqual([['card_1', 'good']]);
  });

  it('asks for the right sentence on a correction card, and shows it with the reason', async () => {
    await open(await learning());
    await answer('Good');
    await screen.findByRole('header', { name: 'die Ausstellung' });
    await answer('Easy');

    expect(await screen.findByText('How is it right?')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Ich habe nach Berlin gefahren' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Show answer' }));

    expect(screen.getByText('Ich bin nach Berlin gefahren')).toBeTruthy();
    expect(
      screen.getByText('Verbs of movement such as “fahren” form the Perfekt with “sein”.'),
    ).toBeTruthy();
  });

  it('says so when every card is done, and leads back to Learn', async () => {
    await open(await learning());
    // "das Wochenende" has its forms, so it is heard with its gender.
    for (const front of [
      'das Wochenende, neuter',
      'die Ausstellung',
      'Ich habe nach Berlin gefahren',
    ]) {
      await screen.findByRole('header', { name: front });
      await answer('Good');
    }

    expect(await screen.findByRole('header', { name: 'Done for now' })).toBeTruthy();
    expect(screen.getByText('You reviewed 3 cards.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Learn' }));

    expect(router.back).toHaveBeenCalled();
  });

  it('brings back a card that was not known, without saying when it will return', async () => {
    const api = await open(await learning());
    await answer('Again');
    await screen.findByRole('header', { name: 'die Ausstellung' });
    await answer('Good');
    await screen.findByRole('header', { name: 'Ich habe nach Berlin gefahren' });
    await answer('Good');

    expect(await screen.findByRole('header', { name: 'das Wochenende, neuter' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Show answer' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Good' }));

    expect(await screen.findByRole('header', { name: 'Done for now' })).toBeTruthy();
    expect(reviews(api)).toHaveLength(4);
  });

  it('says so when a rating could not be saved, and takes it again', async () => {
    const api = await open(await learning());
    api.failNext('reviewCard', 'network');

    await answer('Good');
    expect(await screen.findByText('That couldn’t be saved. Tap your answer again.')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'das Wochenende, neuter' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: /^Good,/ }));
    expect(await screen.findByRole('header', { name: 'die Ausstellung' })).toBeTruthy();
  });

  it('says so when nothing is due', async () => {
    const api = createFakeApi();
    api.enterApp();
    await open(api);

    expect(screen.getByRole('header', { name: 'Nothing to review' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Learn' }));

    expect(router.back).toHaveBeenCalled();
  });

  it('says when the cards cannot be read and reads them again', async () => {
    const api = await learning();
    api.failNext('getDueCards', 'network');
    await open(api);
    expect(
      screen.getByText('Can’t reach Konvami. Check your connection and try again.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('header', { name: 'das Wochenende, neuter' })).toBeTruthy();
  });

  it('can be left at any time', async () => {
    await open(await learning());

    await fireEvent.press(screen.getByRole('button', { name: 'Stop reviewing' }));

    expect(router.back).toHaveBeenCalled();
  });

  it('sends someone who is not signed in to the start', async () => {
    await open(await learning(), { signedIn: false });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
