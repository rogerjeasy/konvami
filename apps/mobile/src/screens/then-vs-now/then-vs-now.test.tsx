import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { conversationRoute } from '@/lib/routes';
import { createFakeApi, recordingOf, type FakeApi } from '@/test/fake-api';
import { createFakeProfileDevice } from '@/test/fake-profile-device';
import { renderScreen } from '@/test/render';
import { ThenVsNowScreen } from '.';

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

async function open(api: FakeApi, device = createFakeProfileDevice()) {
  await renderScreen(<ThenVsNowScreen />, { api, signedIn: true, device });
  await waitFor(() => expect(screen.queryByText('Finding your recordings')).toBeNull());
  return device;
}

describe('5.20 Then vs Now', () => {
  it('sets a recording from the first weeks beside a recent one, with no score', async () => {
    const api = inApp();
    api.talked(0, {
      id: 'rtc_then',
      daysAgo: 60,
      recorded: true,
      learnerSays: ['Ich heiße Amara.'],
    });
    api.talked(0, {
      id: 'rtc_now',
      recorded: true,
      learnerSays: ['Ich wohne seit einem Jahr hier.'],
    });
    await open(api);

    expect(screen.getByRole('header', { name: 'Then vs Now' })).toBeTruthy();
    expect(screen.getByText('8 weeks apart')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Then' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Now' })).toBeTruthy();
    expect(screen.getByLabelText('You, then: Ich heiße Amara.')).toBeTruthy();
    expect(screen.getByLabelText('You, now: Ich wohne seit einem Jahr hier.')).toBeTruthy();
  });

  it('plays the learner’s lines of one side and stops at the end of it', async () => {
    const api = inApp();
    api.talked(0, {
      id: 'rtc_then',
      daysAgo: 60,
      recorded: true,
      learnerSays: ['Ich heiße Amara.', 'Ich komme aus Kenia.'],
    });
    api.talked(0, { id: 'rtc_now', recorded: true, learnerSays: ['Ich wohne hier.'] });
    const device = await open(api);

    await fireEvent.press(screen.getAllByRole('button', { name: 'Play what you said then' })[0]!);
    expect(device.playing).toBe(recordingOf('rtc_then', 1).url);
    await act(() => device.finishClip());
    expect(device.playing).toBe(recordingOf('rtc_then', 2).url);
    await act(() => device.finishClip());

    // It does not run on into "Now": that is the learner's choice to press.
    expect(device.playing).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Play what you said now' }));
    expect(device.playing).toBe(recordingOf('rtc_now', 1).url);
  });

  it('plays one clip at a time across the two sides', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_then', daysAgo: 60, recorded: true });
    api.talked(0, { id: 'rtc_now', recorded: true });
    const device = await open(api);

    await fireEvent.press(screen.getByRole('button', { name: 'Play what you said then' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Play what you said now' }));

    expect(device.playing).toBe(recordingOf('rtc_now', 1).url);
    expect(screen.getAllByRole('button', { name: 'Stop playing' })).toHaveLength(1);
  });

  it('opens either whole conversation', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_then', daysAgo: 60, recorded: true });
    api.talked(0, { id: 'rtc_now', recorded: true });
    await open(api);

    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Hear the whole conversation' })[1]!,
    );

    expect(router.push).toHaveBeenCalledWith(conversationRoute('rtc_now'));
  });

  it('says there is nothing yet when no conversation was recorded', async () => {
    await open(inApp());

    expect(screen.getByText('Nothing recorded yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start a conversation' }));
    expect(router.navigate).toHaveBeenCalledWith('/talk');
  });

  it('asks the learner to keep talking when the recordings are less than a fortnight apart', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_1', daysAgo: 5, recorded: true });
    api.talked(0, { id: 'rtc_2', recorded: true });
    await open(api);

    expect(screen.getByText('Not enough time has passed')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Then' })).toBeNull();
  });

  it('sends a learner who keeps no recordings to the switch', async () => {
    const api = inApp();
    api.talked(0, { id: 'rtc_then', daysAgo: 60, recorded: true });
    await api.configureRecordings(false);
    await open(api);

    expect(screen.getByText('Recordings are switched off')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Privacy and AI' }));
    expect(router.navigate).toHaveBeenCalledWith('/account/privacy');
  });

  it('can be tried again after the recordings could not be loaded', async () => {
    const api = inApp();
    api.failNext('getThenVsNow', 'network');
    await renderScreen(<ThenVsNowScreen />, { api, signedIn: true });

    await screen.findByText('Can’t reach Konvami. Check your connection and try again.');
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Nothing recorded yet')).toBeTruthy();
  });
});
