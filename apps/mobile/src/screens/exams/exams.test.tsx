import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { createFakeProfileDevice } from '@/test/fake-profile-device';
import {
  createFakeVoiceEngine,
  FAKE_CALL_ID,
  type FakeVoiceEngine,
} from '@/test/fake-voice-engine';
import { renderScreen } from '@/test/render';
import { ExamCentreScreen } from '.';
import { ExamPrepScreen } from './prep';
import { SimulationScreen } from './result';
import { ExamTalkScreen } from './talk';

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
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

const GOETHE_B1 = { type: 'goethe', target_level: 'B1', date: '2027-04-15' };

function preparing(): FakeApi {
  const api = createFakeApi();
  api.enterApp({ exam: GOETHE_B1 });
  return api;
}

const prepRoute = { pathname: '/exams/[exam]', params: { exam: 'goethe_b1' } };
const talkRoute = { pathname: '/exams/[exam]/talk', params: { exam: 'goethe_b1' } };
const resultRoute = (id: string) => ({ pathname: '/exams/simulations/[id]', params: { id } });

describe('5.16 Exam centre', () => {
  async function open(api: FakeApi = preparing()) {
    await renderScreen(<ExamCentreScreen />, { api, signedIn: true });
    await screen.findByText('Speaking test');
    return api;
  }

  it('shows the learner’s exam and its speaking test, part by part', async () => {
    await open();

    expect(screen.getByRole('header', { name: 'Exam centre' })).toBeTruthy();
    // The exam in the profile, with its date.
    expect(screen.getByText(/^April 15, 2027 · in \d+ days$/)).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: 'Goethe-Zertifikat B1' }).props.accessibilityState.checked,
    ).toBe(true);
    expect(screen.getByText('3 parts · about 8 min · 15 min to prepare')).toBeTruthy();
    expect(screen.getByText('Part 1 · Plan something together')).toBeTruthy();
    expect(screen.getByText('Part 3 · Respond to feedback and questions')).toBeTruthy();
  });

  it('lets a learner without an exam choose a test, and prepares it', async () => {
    const api = createFakeApi();
    api.enterApp();
    await open(api);

    expect(screen.getByText('There’s no exam in your profile. Choose a test to try.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Deutsch-Test für Zuwanderer' }));
    expect(screen.getByText('Part 2 · Talk about a picture and your experiences')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Prepare a simulation' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/exams/[exam]',
      params: { exam: 'dtz' },
    });
  });

  it('shows how ready the learner is and their simulations', async () => {
    const api = preparing();
    api.simulated('rtc_old', { daysAgo: 7 });
    await open(api);

    expect(screen.getByLabelText('Latest simulation: 63%')).toBeTruthy();
    expect(screen.getByText('Pass mark: 60%')).toBeTruthy();
    expect(screen.getByText('Weakest lately: Part 2 · Present a topic')).toBeTruthy();
    expect(screen.getByText('You’re scoring above the pass mark. Keep it steady.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Goethe-Zertifikat B1 · / }));

    expect(router.push).toHaveBeenCalledWith(resultRoute('rtc_old'));
  });
});

describe('5.17 Preparing a simulation', () => {
  it('shows each part’s card and the preparation time, and starts the test', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ exam: 'goethe_b1' });
    await renderScreen(<ExamPrepScreen />, { api: preparing(), signedIn: true });

    expect(await screen.findByRole('header', { name: 'Goethe-Zertifikat B1' })).toBeTruthy();
    expect(screen.getByText('Time to prepare: 15:00 left')).toBeTruthy();
    expect(
      screen.getByText('Eine Kollegin hört auf zu arbeiten. Planen Sie eine Abschiedsfeier.'),
    ).toBeTruthy();
    expect(screen.getByText('Abschluss und Dank')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start the test' }));

    expect(router.replace).toHaveBeenCalledWith(talkRoute);
  });
});

describe('5.17 The simulation', () => {
  const toolResult = (output: unknown) => ({
    type: 'conversation.item.done',
    item: { id: 'out', type: 'function_call_output', call_id: 'c', output: JSON.stringify(output) },
  });
  const play = (voice: FakeVoiceEngine, ...events: unknown[]) =>
    act(async () => events.forEach((event) => voice.emit(event)));

  async function open(voice = createFakeVoiceEngine()) {
    jest.mocked(useLocalSearchParams).mockReturnValue({ exam: 'goethe_b1' });
    await renderScreen(<ExamTalkScreen />, { api: preparing(), voice, signedIn: true });
    await waitFor(() => expect(voice.starts).toBe(1));
    return voice;
  }

  it('starts an exam call with the examiner for the chosen test', async () => {
    const voice = await open();

    expect(voice.openedFor).toEqual(['exam']);
    expect(voice.openedScenarios).toEqual(['goethe_b1']);
    expect(screen.getByRole('header', { name: 'Frau Becker' })).toBeTruthy();
    expect(screen.getByText('The examiner will introduce the first part.')).toBeTruthy();
  });

  it('shows the card of the part the examiner begins', async () => {
    const voice = await open();

    await play(voice, toolResult({ part: 'teil_2', seconds: 180 }));

    expect(screen.getByText('Sollen Kinder ein eigenes Handy haben?')).toBeTruthy();
    expect(screen.getByText('Part 2 · Present a topic · 3 min')).toBeTruthy();
  });

  it('opens the score once the test is over', async () => {
    const voice = await open();
    await play(voice, toolResult({ part: 'teil_1', seconds: 180 }));

    await fireEvent.press(screen.getByRole('button', { name: 'End the test' }));

    expect(router.replace).toHaveBeenCalledWith(resultRoute(FAKE_CALL_ID));
  });
});

describe('5.18 A simulation’s score', () => {
  async function open(api: FakeApi, device = createFakeProfileDevice()) {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'rtc_1' });
    await renderScreen(<SimulationScreen />, { api, signedIn: true, device });
    return device;
  }

  it('says the test is being scored while it is', async () => {
    const api = preparing();
    api.simulated('rtc_1', { status: 'pending', scores: 'pending' });
    await open(api);

    expect(
      await screen.findByText('Your test is being scored. This takes about half a minute…'),
    ).toBeTruthy();
  });

  it('shows the estimate, each part’s marks and feedback, and plays a strong answer', async () => {
    const api = preparing();
    api.simulated('rtc_1');
    const device = await open(api);

    // The whole test, then every part of it.
    expect(await screen.findAllByText('63%')).toHaveLength(4);
    expect(screen.getByText('Above the pass mark of 60%')).toBeTruthy();
    expect(screen.getByText(/An estimate from what was written down/)).toBeTruthy();
    expect(screen.getAllByText('Task completion')).toHaveLength(3);
    expect(screen.getAllByText('3 of 4')).toHaveLength(6);
    expect(screen.getByRole('header', { name: 'Part 2 · Present a topic' })).toBeTruthy();
    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Listen to the strong answer' })[0]!,
    );

    await waitFor(() =>
      expect(device.played).toEqual(['https://files.test/exams/rtc_1/teil_1.mp3']),
    );
  });

  it('says why a test has no score, and asks again for one that failed', async () => {
    const api = preparing();
    api.simulated('rtc_1', { status: 'failed' });
    await open(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'Score it again' }));

    expect(api.calls.at(-1)).toEqual(['rescoreSimulation', 'rtc_1']);
  });

  it('offers another simulation of the same test', async () => {
    const api = preparing();
    api.simulated('rtc_1');
    await open(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'Another simulation' }));

    expect(router.replace).toHaveBeenCalledWith(prepRoute);
  });
});
