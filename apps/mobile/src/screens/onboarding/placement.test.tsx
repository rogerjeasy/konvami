import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_RESULT, type FakeApi } from '@/test/fake-api';
import { createFakeVoiceEngine, type FakeVoiceEngine } from '@/test/fake-voice-engine';
import { renderScreen } from '@/test/render';
import { PlacementIntroScreen } from './placement-intro';
import { PlacementResultScreen } from './placement-result';
import { PlacementTalkScreen } from './placement-talk';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
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

afterEach(() => {
  jest.useRealTimers();
});

/** An API whose learner (own estimate: A2) has confirmed the review and reached the test. */
function atPlacement(): FakeApi {
  const api = createFakeApi();
  api.advanceTo('placement');
  return api;
}

const NETWORK = 'Can’t reach Konvami. Check your connection and try again.';

describe('4.4 Placement intro', () => {
  async function open(api: FakeApi = atPlacement()) {
    await renderScreen(<PlacementIntroScreen />, { api, signedIn: true });
    await waitFor(() => expect(screen.queryByText('Getting things ready')).toBeNull());
    return api;
  }

  it('says what the test is and what the learner estimated', async () => {
    await open();

    expect(screen.getByRole('header', { name: 'Let’s find your real level' })).toBeTruthy();
    expect(screen.getByText(/A short spoken test with Mia, in German/)).toBeTruthy();
    expect(screen.getByText('About 8 minutes, just talking')).toBeTruthy();
    expect(screen.getByText('Your estimate: A2 · Elementary')).toBeTruthy();
  });

  it('starts the test', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Start the test' }));

    expect(router.push).toHaveBeenCalledWith('/onboarding/placement/talk');
  });

  it('can be skipped: practice then starts at the learner’s own estimate', async () => {
    const api = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/partners'));
    expect(api.calls).toContainEqual(['skipPlacement']);
  });

  it('says so when skipping fails, and stays', async () => {
    const api = await open();
    api.failNext('skipPlacement', 'network');

    await fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));

    expect(await screen.findByText(NETWORK)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('sends a learner who is somewhere else in onboarding there', async () => {
    const api = createFakeApi();
    api.advanceTo('partners');
    await open(api);

    expect(screen.getByText('redirect:/onboarding/partners')).toBeTruthy();
  });
});

// The provider's events, as in src/voice/conversation.test.ts.
const SESSION_CREATED = { type: 'session.created', session: { type: 'realtime' } };
const AUDIO_STARTED = { type: 'output_audio_buffer.started', response_id: 'resp_1' };
const AUDIO_STOPPED = { type: 'output_audio_buffer.stopped', response_id: 'resp_1' };
const toolResult = (output: unknown) => ({
  type: 'conversation.item.done',
  item: {
    id: 'item_out',
    type: 'function_call_output',
    call_id: 'call_1',
    output: JSON.stringify(output),
  },
});

describe('4.5 Placement test', () => {
  async function open({
    api = atPlacement(),
    voice = createFakeVoiceEngine(),
  }: { api?: FakeApi; voice?: FakeVoiceEngine } = {}) {
    await renderScreen(<PlacementTalkScreen />, { api, voice, signedIn: true });
    await waitFor(() => expect(voice.starts).toBe(1));
    return { api, voice };
  }

  const play = (voice: FakeVoiceEngine, ...events: unknown[]) =>
    act(async () => events.forEach((event) => voice.emit(event)));

  it('starts a placement call at once', async () => {
    const { voice } = await open();

    expect(voice.openedFor).toEqual(['placement']);
    expect(screen.getByRole('header', { name: 'Mia' })).toBeTruthy();
  });

  it('ticks off each part of the test as the examiner notes it', async () => {
    const { voice } = await open();
    await play(voice, SESSION_CREATED);
    expect(screen.getByLabelText('Warm-up: still to come')).toBeTruthy();

    await play(
      voice,
      toolResult({ noted: 1, enough: false, task: 'warm_up' }),
      // An easier warm-up after one that was too hard counts once.
      toolResult({ noted: 2, enough: false, task: 'warm_up' }),
      toolResult({ noted: 3, enough: false, task: 'listening' }),
    );

    expect(screen.getByLabelText('Warm-up: done')).toBeTruthy();
    expect(screen.getByLabelText('Listening: done')).toBeTruthy();
    expect(screen.getByLabelText('Describing: still to come')).toBeTruthy();
  });

  it('offers “I don’t know” only on the learner’s turn, and says it for them', async () => {
    const { voice } = await open();
    await play(voice, SESSION_CREATED, AUDIO_STARTED);
    expect(screen.getByRole('button', { name: 'I don’t know' })).toBeDisabled();

    await play(voice, AUDIO_STOPPED);
    await fireEvent.press(screen.getByRole('button', { name: 'I don’t know' }));

    expect(voice.said).toEqual(['I don’t know']);
    // On the button and, now, as the learner's latest line.
    expect(screen.getAllByText('I don’t know')).toHaveLength(2);
    expect(screen.getByText('Mia is thinking')).toBeTruthy();
  });

  it('opens the result once the test is over and the goodbye has been heard', async () => {
    const { voice } = await open();
    await play(voice, SESSION_CREATED, toolResult({ done: true }));
    expect(screen.getByText('That’s it. Working out your level…')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();

    await play(voice, AUDIO_STARTED, AUDIO_STOPPED);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/placement/result'),
    );
    expect(voice.stops).toBeGreaterThan(0);
  });

  it('opens the result when a running test is ended early', async () => {
    const { voice } = await open();
    await play(voice, SESSION_CREATED, AUDIO_STARTED);

    await fireEvent.press(screen.getByRole('button', { name: 'End the test' }));

    expect(voice.stops).toBeGreaterThan(0);
    expect(router.replace).toHaveBeenCalledWith('/onboarding/placement/result');
  });

  it('goes back when it is closed before the test has begun', async () => {
    const voice = createFakeVoiceEngine();
    const release = voice.holdStart();
    await renderScreen(<PlacementTalkScreen />, { api: atPlacement(), voice, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'End the test' }));

    expect(router.back).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => release());
  });

  it.each([
    [
      'mic_denied',
      'Konvami can’t use the microphone. Allow it in your device settings, or skip the test for now.',
    ],
    ['unsupported', 'Voice needs the full Konvami app. In this preview, skip the test for now.'],
    [
      'call_limit',
      'You’ve reached today’s limit for voice tests. Skip it for now and try tomorrow.',
    ],
    ['network', NETWORK],
  ] as const)(
    'explains a test that cannot start (%s) and can be skipped',
    async (code, message) => {
      const voice = createFakeVoiceEngine();
      voice.failNextStart(code);
      const api = atPlacement();
      await renderScreen(<PlacementTalkScreen />, { api, voice, signedIn: true });

      expect(await screen.findByText(message)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Skip the test for now' }));

      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/partners'));
      expect(api.calls).toContainEqual(['skipPlacement']);
    },
  );

  it('can try again after a failed start', async () => {
    const voice = createFakeVoiceEngine();
    voice.failNextStart('voice_unavailable');
    await renderScreen(<PlacementTalkScreen />, { api: atPlacement(), voice, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(voice.starts).toBe(2));
  });

  it('sends someone who is not signed in to the start', async () => {
    const voice = createFakeVoiceEngine();
    await renderScreen(<PlacementTalkScreen />, { voice });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
    expect(voice.starts).toBe(0);
  });
});

describe('4.6 Placement result', () => {
  async function open(api: FakeApi) {
    await renderScreen(<PlacementResultScreen />, { api, signedIn: true });
    await waitFor(() => expect(screen.queryByText('Getting things ready')).toBeNull());
    return api;
  }

  /** An API whose test has ended in `status`. */
  function tested(status: Parameters<FakeApi['assess']>[0], result = FAKE_RESULT): FakeApi {
    const api = atPlacement();
    api.assess(status, result);
    return api;
  }

  it('waits while the test is being assessed, then shows the result', async () => {
    jest.useFakeTimers();
    const api = await open(tested('assessing'));
    expect(await screen.findByText('Working out your level…')).toBeTruthy();

    api.assess('measured');
    await act(() => jest.advanceTimersByTimeAsync(2500));

    expect(await screen.findByRole('header', { name: 'B1 · Intermediate' })).toBeTruthy();
    expect(screen.queryByText('Working out your level…')).toBeNull();
  });

  it('shows the level of each skill and what to work on first', async () => {
    await open(tested('measured'));

    expect(await screen.findByRole('header', { name: 'B1 · Intermediate' })).toBeTruthy();
    expect(screen.getByLabelText('Speaking: B1')).toBeTruthy();
    expect(screen.getByLabelText('Grammar: A2')).toBeTruthy();
    expect(screen.getByLabelText('Pronunciation: B2')).toBeTruthy();
    expect(screen.getByText('Worth working on first')).toBeTruthy();
    expect(screen.getByText('Dative after “mit”')).toBeTruthy();
  });

  it('leaves out the list of things to work on when the test found none', async () => {
    await open(tested('measured', { ...FAKE_RESULT, weakAreas: [] }));

    await screen.findByRole('header', { name: 'B1 · Intermediate' });
    expect(screen.queryByText('Worth working on first')).toBeNull();
  });

  it('lets the learner choose when the test and their estimate differ: measured by default', async () => {
    const api = await open(tested('measured'));

    const measured = await screen.findByRole('radio', {
      name: 'B1 · Intermediate, Measured in your test',
    });
    expect(measured).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/partners'));
    expect(api.calls).toContainEqual(['decidePlacement', 'measured']);
  });

  it('starts at the learner’s own estimate when they prefer it', async () => {
    const api = await open(tested('measured'));

    await fireEvent.press(
      await screen.findByRole('radio', { name: 'A2 · Elementary, Your own estimate' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(api.calls).toContainEqual(['decidePlacement', 'self']));
  });

  it('says so when the choice cannot be saved', async () => {
    const api = await open(tested('measured'));
    await screen.findByRole('radio', { name: 'A2 · Elementary, Your own estimate' });
    api.failNext('decidePlacement', 'network');

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(NETWORK)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('has nothing to choose when the test confirms the estimate', async () => {
    const api = await open(tested('decided', { ...FAKE_RESULT, overall: 'A2' }));

    expect(await screen.findByText('That matches your own estimate.')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(router.replace).toHaveBeenCalledWith('/onboarding/partners');
    expect(api.calls.map(([method]) => method)).not.toContain('decidePlacement');
  });

  it('offers another try or the own estimate when the test could not be measured', async () => {
    const api = await open(tested('inconclusive'));

    expect(
      await screen.findByRole('header', { name: 'I couldn’t measure your level this time' }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Take the test again' }));
    expect(router.replace).toHaveBeenCalledWith('/onboarding/placement/talk');

    await fireEvent.press(screen.getByRole('button', { name: 'Start at my own estimate' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/partners'));
    expect(api.calls).toContainEqual(['skipPlacement']);
  });

  it('stops waiting for a test that never finishes and offers the same ways on', async () => {
    jest.useFakeTimers();
    await open(tested('in_progress'));
    expect(await screen.findByText('Working out your level…')).toBeTruthy();

    // Each poll answers before the next is scheduled, so the clock moves on between them.
    await act(() => jest.advanceTimersByTimeAsync(120_000));

    expect(
      await screen.findByRole('header', { name: 'I couldn’t measure your level this time' }),
    ).toBeTruthy();
  });

  it('says so when the result cannot be loaded, and tries again', async () => {
    const api = tested('measured');
    api.failNext('getPlacement', 'network');
    await open(api);

    expect(await screen.findByText(NETWORK)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('header', { name: 'B1 · Intermediate' })).toBeTruthy();
  });

  it('sends a learner who has not taken the test to its introduction', async () => {
    await open(atPlacement());

    expect(await screen.findByText('redirect:/onboarding/placement')).toBeTruthy();
  });
});
