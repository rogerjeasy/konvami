import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { router, useLocalSearchParams } from 'expo-router';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { FAKE_QUESTION, FAKE_SHOW_ID } from '@/test/fake-radio';
import { createFakeRecorder } from '@/test/fake-recorder';
import { renderScreen } from '@/test/render';
import { RadioQueue } from '@/screens/flags/radio-queue';
import { RadioScreen } from '.';
import { RadioArchiveScreen } from './archive';
import { RadioCallScreen } from './call';
import { RadioCallInScreen } from './call-in';
import { RadioEpisodeScreen } from './episode';
import { RadioJoinScreen } from './join';
import { RadioSettingsScreen } from './settings';

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

/** A learner in the app with the show open, and joined when `join` is true. */
async function tunedIn(join = true): Promise<FakeApi> {
  const api = createFakeApi();
  api.enterApp();
  api.radioOpen();
  if (join) await api.joinRadio({ veilDefault: true, voiceConsent: true });
  return api;
}

describe('8.1 Radio Konvami', () => {
  it('says it is not open yet for an account it is not open to', async () => {
    const api = createFakeApi();
    api.enterApp();
    await renderScreen(<RadioScreen />, { api, signedIn: true });

    expect(await screen.findByText(/isn’t open for your account yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Join to call in' })).toBeNull();
  });

  it('shows today’s show and the next question, and leads to joining', async () => {
    const api = await tunedIn(false);
    await renderScreen(<RadioScreen />, { api, signedIn: true });

    expect(await screen.findByText(FAKE_QUESTION)).toBeTruthy();
    expect(screen.getByText('Was isst du am liebsten zum Frühstück?')).toBeTruthy();
    expect(screen.getByText('How it works')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Join to call in' }));
    expect(router.push).toHaveBeenCalledWith('/radio/join');
  });

  it('opens today’s show, and celebrates a call that aired', async () => {
    const api = await tunedIn();
    await api.sendRadioCall({ audio: 'AAEC', format: 'm4a', durationMs: 9000, veiled: true });
    api.radioAired();
    await renderScreen(<RadioScreen />, { api, signedIn: true });

    expect(await screen.findByText('You’re on the radio!')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Listen to the show' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/radio/episodes/[id]',
      params: { id: FAKE_SHOW_ID },
    });
  });
});

describe('8.7 Join', () => {
  it('needs an adult’s consent, then goes on to calling in', async () => {
    const api = await tunedIn(false);
    await renderScreen(<RadioJoinScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Join the show' }));
    expect(await screen.findByText(/Agree that other learners may hear your calls/)).toBeTruthy();

    await fireEvent.press(
      screen.getByRole('switch', { name: 'Other learners may hear my calls on the show' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Join the show' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/radio/call-in'));
  });

  it('lets a learner under 18 join without it, as private practice', async () => {
    const api = await tunedIn(false);
    api.radioMinor();
    await renderScreen(<RadioJoinScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Join the show' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/radio/call-in'));
  });
});

describe('8.3 Call in', () => {
  it('records, listens back and sends a veiled call', async () => {
    const api = await tunedIn();
    const recorder = createFakeRecorder();
    await renderScreen(<RadioCallInScreen />, { api, signedIn: true, recorder });

    expect(await screen.findByText('Was isst du am liebsten zum Frühstück?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start recording' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Stop' }));
    expect(await screen.findByRole('button', { name: 'Listen back' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Send my call' }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/radio/calls/[id]',
        params: { id: 'call-1' },
      }),
    );
    const sent = api.calls.find(([method]) => method === 'sendRadioCall');
    expect(sent?.[1]).toMatchObject({ veiled: true, format: 'm4a' });
  });

  it('tells a learner under 18 that their calls stay private', async () => {
    const api = createFakeApi();
    api.enterApp();
    api.radioOpen();
    api.radioMinor();
    await api.joinRadio({ veilDefault: true, voiceConsent: false });
    await renderScreen(<RadioCallInScreen />, {
      api,
      signedIn: true,
      recorder: createFakeRecorder(),
    });

    expect(await screen.findByText(/they’re never aired/)).toBeTruthy();
    expect(
      screen.queryByRole('switch', { name: 'Veil: a neutral voice reads my words' }),
    ).toBeNull();
  });
});

describe('8.2 A show', () => {
  it('plays the show, gives applause to a call and reports one', async () => {
    const api = await tunedIn();
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: FAKE_SHOW_ID });
    await renderScreen(<RadioEpisodeScreen />, { api, signedIn: true });

    expect(await screen.findByText(/Einmal bin ich im Zug eingeschlafen/)).toBeTruthy();
    expect(screen.getAllByText('AI').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Play the show' }));
    expect(await screen.findByText('Now playing')).toBeTruthy();

    const [clap] = screen.getAllByRole('radio', { name: 'Ha ha, 0' });
    if (!clap) throw new Error('no applause card');
    await fireEvent.press(clap);
    expect(await screen.findByRole('radio', { name: 'Ha ha, 1' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Report Klara' }));
    await fireEvent.press(await screen.findByText('Hate'));
    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('You reported this. It’s hidden for you.')).toBeTruthy();
  });
});

describe('8.4 Your call', () => {
  it('shows the corrections, practises a confirmed one and keeps it as a card', async () => {
    const api = await tunedIn();
    const sent = await api.sendRadioCall({ audio: 'AAEC', format: 'm4a', durationMs: 9000 });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: sent.id });
    await renderScreen(<RadioCallScreen />, {
      api,
      signedIn: true,
      recorder: createFakeRecorder(),
    });

    expect(await screen.findByText('Ich esse gern Brötchen mit Honig.')).toBeTruthy();
    expect(screen.getByText('Not sure')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep as a card' }));
    expect(await screen.findByRole('button', { name: 'Kept as a card' })).toBeTruthy();
    expect(api.calls.some(([method]) => method === 'saveRadioCorrectionCard')).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Take my call back' }));
    expect(await screen.findByText('Your call was taken back.')).toBeTruthy();
  });
});

describe('8.5 Past shows and 8.6 settings', () => {
  it('lists past shows', async () => {
    const api = await tunedIn();
    await renderScreen(<RadioArchiveScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: new RegExp(FAKE_QUESTION) }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/radio/episodes/[id]',
      params: { id: FAKE_SHOW_ID },
    });
  });

  it('rerolls the codename and deletes the calls after a confirmation', async () => {
    const api = await tunedIn();
    await renderScreen(<RadioSettingsScreen />, { api, signedIn: true });

    expect(await screen.findByText('Your codename: Nova-7')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'New codename' }));
    expect(await screen.findByText('Your codename: Vega-12')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Withdraw and delete my calls' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete my calls' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/radio'));
    expect(api.calls.some(([method]) => method === 'leaveRadio')).toBe(true);
  });
});

describe('8.8 The owner’s queue', () => {
  it('removes a held call', async () => {
    const api = await tunedIn();
    api.radioQueued({
      kind: 'held',
      id: 'held-1',
      episodeId: 'show-2',
      transcript: 'Schreib mir auf Insta',
      reasons: ['contact_or_meetup'],
      speaker: 'Nova-7',
      ai: false,
      reporter: null,
      note: null,
      band: 'adult',
      day: '2026-11-21',
      createdAt: '2026-11-20T12:00:00Z',
    });
    await renderScreen(<RadioQueue />, { api, signedIn: true });

    expect(await screen.findByText('Schreib mir auf Insta')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Nothing to decide on the show.')).toBeTruthy();
  });
});
