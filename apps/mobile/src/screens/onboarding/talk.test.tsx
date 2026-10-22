import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, ESSENTIAL_ANSWERS, type FakeApi } from '@/test/fake-api';
import { createFakeVoiceEngine, type FakeVoiceEngine } from '@/test/fake-voice-engine';
import { renderScreen } from '@/test/render';
import { TalkScreen } from './talk';

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

// The provider's events, as in src/voice/conversation.test.ts.
const SESSION_CREATED = { type: 'session.created', session: { type: 'realtime' } };
const AUDIO_STARTED = { type: 'output_audio_buffer.started', response_id: 'resp_1' };
const AUDIO_STOPPED = { type: 'output_audio_buffer.stopped', response_id: 'resp_1' };
const personaSaid = (transcript: string, item = 'item_a') => ({
  type: 'response.output_audio_transcript.done',
  item_id: item,
  transcript,
});
const learnerSaid = (transcript: string) => ({
  type: 'conversation.item.input_audio_transcription.completed',
  item_id: 'item_u',
  transcript,
});
const toolResult = (output: unknown) => ({
  type: 'conversation.item.done',
  item: {
    id: 'item_out',
    type: 'function_call_output',
    call_id: 'call_1',
    output: JSON.stringify(output),
  },
});

async function open({
  api = createFakeApi(),
  voice = createFakeVoiceEngine(),
}: { api?: FakeApi; voice?: FakeVoiceEngine } = {}) {
  await renderScreen(<TalkScreen />, { api, voice, signedIn: true });
  await waitFor(() => expect(voice.starts).toBe(1));
  return { api, voice };
}

const play = (voice: FakeVoiceEngine, ...events: unknown[]) =>
  act(async () => events.forEach((event) => voice.emit(event)));

describe('4.1 Talk with Mia', () => {
  it('starts the call at once and says that it is connecting', async () => {
    const voice = createFakeVoiceEngine();
    const release = voice.holdStart();
    await renderScreen(<TalkScreen />, { voice, signedIn: true });

    expect(await screen.findByText('Connecting…')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Mia' })).toBeTruthy();
    expect(voice.starts).toBe(1);
    await act(async () => release());
  });

  it('says who is speaking and whose turn it is', async () => {
    const { voice } = await open();

    await play(voice, SESSION_CREATED, AUDIO_STARTED);
    expect(screen.getByText('Mia is speaking')).toBeTruthy();

    await play(voice, AUDIO_STOPPED);
    expect(screen.getByText('Your turn. Mia is listening.')).toBeTruthy();

    await play(voice, { type: 'input_audio_buffer.speech_started', item_id: 'item_u' });
    expect(screen.getByText('Listening to you')).toBeTruthy();

    await play(voice, { type: 'input_audio_buffer.speech_stopped', item_id: 'item_u' });
    expect(screen.getByText('Mia is thinking')).toBeTruthy();
  });

  it('shows what Mia says and what the learner said', async () => {
    const { voice } = await open();

    await play(
      voice,
      SESSION_CREATED,
      personaSaid('Hi Amara! Is English okay for this short setup?'),
      learnerSaid('Yes, and I want to learn German.'),
    );

    expect(screen.getByText('Hi Amara! Is English okay for this short setup?')).toBeTruthy();
    expect(screen.getByText('Yes, and I want to learn German.')).toBeTruthy();
  });

  it('shows the two latest lines in the order they were spoken', async () => {
    const { voice } = await open();

    await play(
      voice,
      SESSION_CREATED,
      personaSaid('Is English okay?', 'item_a'),
      learnerSaid('Yes, English is fine.'),
      personaSaid('Great. Why are you learning German?', 'item_b'),
    );

    const lines = screen
      .getAllByText(/English is fine|Why are you learning German/)
      .map((line) => line.props.children);
    expect(lines).toEqual(['Yes, English is fine.', 'Great. Why are you learning German?']);
    expect(screen.queryByText('Is English okay?')).toBeNull();
  });

  it('ticks off each question as the server saves its answer', async () => {
    const { voice } = await open();
    expect(screen.getByLabelText('Language: still to come')).toBeTruthy();

    await play(
      voice,
      SESSION_CREATED,
      toolResult({ saved: true, still_open: ['explanations', 'goals', 'exam', 'level', 'course'] }),
    );

    expect(screen.getByLabelText('Language: saved')).toBeTruthy();
    expect(screen.getByLabelText('Goals: still to come')).toBeTruthy();
  });

  it('starts with the questions that were answered before the call', async () => {
    const api = createFakeApi();
    api.answer(ESSENTIAL_ANSWERS.slice(0, 3));

    await open({ api });

    expect(await screen.findByLabelText('Language: saved')).toBeTruthy();
    expect(screen.getByLabelText('Explanations: saved')).toBeTruthy();
    expect(screen.getByLabelText('Goals: still to come')).toBeTruthy();
  });

  it('mutes and unmutes the microphone', async () => {
    const { voice } = await open();
    await play(voice, SESSION_CREATED);

    await fireEvent.press(screen.getByRole('button', { name: 'Mute microphone' }));
    expect(voice.muted).toBe(true);
    expect(screen.getByText('Your microphone is off')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Unmute microphone' }));
    expect(voice.muted).toBe(false);
  });

  it('opens the summary once everything is saved and the goodbye has been heard', async () => {
    const api = createFakeApi();
    const { voice } = await open({ api });
    api.answer(ESSENTIAL_ANSWERS);

    await play(voice, SESSION_CREATED, toolResult({ done: true }), AUDIO_STARTED);
    expect(router.replace).not.toHaveBeenCalled();
    await play(voice, AUDIO_STOPPED);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/review'));
    expect(voice.stops).toBeGreaterThan(0);
    // What the server saved during the call was read again for the summary.
    expect(api.calls.filter(([method]) => method === 'getProfile').length).toBeGreaterThan(1);
  });

  it('switches to typing at the first open question, keeping what was said', async () => {
    const api = createFakeApi();
    const { voice } = await open({ api });
    // The server saved two answers during the call.
    api.answer(ESSENTIAL_ANSWERS.slice(0, 3));

    await fireEvent.press(screen.getByRole('button', { name: 'Type instead' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/goals'));
    expect(voice.stops).toBeGreaterThan(0);
  });

  it('ends the call when the screen is closed', async () => {
    const { voice } = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'End the conversation' }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(voice.stops).toBeGreaterThan(0);
  });

  it('ends the call when the screen goes away for any other reason', async () => {
    const voice = createFakeVoiceEngine();
    const view = await renderScreen(<TalkScreen />, { voice, signedIn: true });
    await waitFor(() => expect(voice.starts).toBe(1));

    await view.unmount();

    expect(voice.stops).toBeGreaterThan(0);
  });

  it.each([
    [
      'mic_denied',
      'Konvami can’t use the microphone. Allow it in your device settings, or use the form.',
    ],
    ['unsupported', 'Voice needs the full Konvami app. In this preview, please use the form.'],
    [
      'minutes_used_up',
      'You’ve used this week’s voice minutes. Please use the form. They come back on Monday, October 12.',
    ],
    ['voice_paused', 'Voice is paused for now. Please use the form.'],
    [
      'voice_unavailable',
      'Voice isn’t available right now. Try again in a moment, or use the form.',
    ],
    ['network', 'Can’t reach Konvami. Check your connection and try again.'],
  ] as const)(
    'explains a call that cannot start (%s) and offers the form',
    async (code, message) => {
      const voice = createFakeVoiceEngine();
      voice.failNextStart(code);
      await renderScreen(<TalkScreen />, { voice, signedIn: true });

      expect(await screen.findByText(message)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Use the form instead' }));

      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/language'));
    },
  );

  it('can try again after a failed start', async () => {
    const voice = createFakeVoiceEngine();
    voice.failNextStart('voice_unavailable');
    await renderScreen(<TalkScreen />, { voice, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(voice.starts).toBe(2));
    await play(voice, SESSION_CREATED, AUDIO_STARTED);

    expect(screen.getByText('Mia is speaking')).toBeTruthy();
  });

  it('says that nothing is lost when the connection drops', async () => {
    const { voice } = await open();
    await play(voice, SESSION_CREATED, AUDIO_STARTED);

    await play(voice, { type: 'connection.lost' });

    expect(
      screen.getByText('The connection dropped. Everything you said so far is saved.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('sends someone who is not signed in to the start', async () => {
    const voice = createFakeVoiceEngine();
    await renderScreen(<TalkScreen />, { voice });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
    expect(voice.starts).toBe(0);
  });
});
