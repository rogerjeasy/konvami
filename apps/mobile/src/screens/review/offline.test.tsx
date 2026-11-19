import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { ApiError } from '@konvami/api-client';
import { createOfflineApi } from '@/offline/api';
import type { OfflineCache } from '@/offline/cache';
import { createFakeApi, FAKE_NOW, type FakeApi } from '@/test/fake-api';
import { createPhoneStorage } from '@/test/fake-phone-storage';
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

/** A learner with three cards due, whose phone read them once while it had a connection. */
async function readOnce(): Promise<{ api: FakeApi; cache: OfflineCache }> {
  const api = createFakeApi();
  api.enterApp();
  await api.learning();
  const cache = createPhoneStorage();
  await createOfflineApi(api, cache, () => Date.parse(FAKE_NOW)).getDueCards();
  return { api, cache };
}

/** No connection from now on: every read and every sync fails as the network does. */
function goOffline(api: FakeApi) {
  for (const method of ['getDueCards', 'getCardsAhead', 'syncCardReviews', 'answerCard'] as const)
    api[method] = jest.fn().mockRejectedValue(new ApiError('network'));
}

async function open(api: FakeApi, cache: OfflineCache) {
  await renderScreen(<ReviewScreen />, { api, offline: cache, signedIn: true });
  await waitFor(() => expect(screen.queryByText('Getting your cards')).toBeNull());
}

describe('5.11 Review offline', () => {
  it('reviews the cards kept on the phone, and keeps the answers until they are sent', async () => {
    const { api, cache } = await readOnce();
    const sync = api.syncCardReviews;
    goOffline(api);
    await open(api, cache);

    expect(
      screen.getByText(
        'You’re offline. Your answers are kept on this phone and sent when you’re back online.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('header', { name: 'das Wochenende, neuter' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Show answer' }));
    await fireEvent.press(screen.getByRole('button', { name: /^Good,/ }));

    expect(await screen.findByRole('header', { name: 'die Ausstellung' })).toBeTruthy();
    expect(await screen.findByText('1 review saved on this device, waiting to sync.')).toBeTruthy();

    // The connection is back: the rating is sent and the notice goes.
    api.syncCardReviews = sync;
    await fireEvent.press(screen.getByRole('button', { name: 'Sync reviews' }));

    await waitFor(() =>
      expect(screen.queryByText('1 review saved on this device, waiting to sync.')).toBeNull(),
    );
    expect((await api.getCard('card_1')).reviews).toBe(1);
  });

  it('turns the cards over instead of answering out loud, and says why calmly', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ aloud: '1' });
    const { api, cache } = await readOnce();
    goOffline(api);
    await open(api, cache);

    expect(
      screen.getByText(
        'Answering out loud needs a connection, so for now you turn the cards over. Your answers are kept on this phone and sent when you’re back online.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Answer out loud' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByRole('button', { name: /^Good,/ })).toBeTruthy();
  });

  it('says nothing about being offline while there is a connection', async () => {
    const { api, cache } = await readOnce();
    await open(api, cache);

    expect(screen.getByRole('header', { name: 'das Wochenende, neuter' })).toBeTruthy();
    expect(screen.queryByText(/You’re offline/)).toBeNull();
  });
});
