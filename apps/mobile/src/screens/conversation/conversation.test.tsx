import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { POLL_MS } from '@/practice/report-follower';
import { createFakeApi, FAKE_PERSONAS, FAKE_REPORT, type FakeApi } from '@/test/fake-api';
import {
  createFakeVoiceEngine,
  FAKE_CALL_ID,
  type FakeVoiceEngine,
} from '@/test/fake-voice-engine';
import { renderScreen } from '@/test/render';
import { ConversationDoneScreen } from './done';
import { LiveConversationScreen } from './live';
import { getPreferences, setLiveCorrections, setPartnerCaptions } from '@/preferences';

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    navigate: jest.fn(),
    dismissTo: jest.fn(),
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
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

afterEach(async () => {
  jest.useRealTimers();
  await setPartnerCaptions(true);
  await setLiveCorrections(true);
});

const LENA = FAKE_PERSONAS[0]!;
const DONE = { pathname: '/conversations/[id]/done', params: { id: FAKE_CALL_ID } };

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

// The provider's events, as in src/voice/conversation.test.ts.
const SESSION_CREATED = { type: 'session.created', session: { type: 'realtime' } };
const AUDIO_STARTED = { type: 'output_audio_buffer.started', response_id: 'resp_1' };
const AUDIO_STOPPED = { type: 'output_audio_buffer.stopped', response_id: 'resp_1' };
const personaSaid = (transcript: string) => ({
  type: 'response.output_audio_transcript.done',
  item_id: 'item_a',
  transcript,
});
const learnerSaid = (transcript: string) => ({
  type: 'conversation.item.input_audio_transcription.completed',
  item_id: 'item_u',
  transcript,
});
const ENDED_BY_PARTNER = {
  type: 'conversation.item.done',
  item: {
    id: 'item_out',
    type: 'function_call_output',
    call_id: 'call_1',
    output: JSON.stringify({ done: true }),
  },
};

const PERFEKT = {
  said: 'Ich habe nach Berlin gefahren',
  better: 'Ich bin nach Berlin gefahren',
  why: 'With fahren, the Perfekt takes sein.',
  topic: 'perfekt_auxiliary',
  focus: false,
};
/** A note of the server's Live Error Spotter, as the call's data channel delivers it. */
const liveCorrection = (turn: string, ...corrections: unknown[]) => ({
  type: 'conversation.item.done',
  item: {
    id: `item_note_${turn}`,
    type: 'message',
    role: 'system',
    content: [
      { type: 'input_text', text: `live_correction: ${JSON.stringify({ turn, corrections })}` },
    ],
  },
});

const play = (voice: FakeVoiceEngine, ...events: unknown[]) =>
  act(async () => events.forEach((event) => voice.emit(event)));

describe('5.3 Conversation', () => {
  async function open({
    api = inApp(),
    voice = createFakeVoiceEngine(),
    personaId = LENA.id,
    scenario,
    practise,
  }: {
    api?: FakeApi;
    voice?: FakeVoiceEngine;
    personaId?: string;
    scenario?: string;
    practise?: string;
  } = {}) {
    jest.mocked(useLocalSearchParams).mockReturnValue({
      personaId,
      ...(scenario ? { scenario } : {}),
      ...(practise ? { practise } : {}),
    });
    await renderScreen(<LiveConversationScreen />, { api, voice, signedIn: true });
    return { api, voice };
  }

  const live = async (options?: Parameters<typeof open>[0]) => {
    const opened = await open(options);
    await waitFor(() => expect(opened.voice.starts).toBe(1));
    await screen.findByText(/left$/);
    return opened;
  };

  it('starts a practice call with the partner that was chosen', async () => {
    const { voice } = await live();

    expect(screen.getByRole('header', { name: 'Lena' })).toBeTruthy();
    expect(voice.openedFor).toEqual(['practice']);
    expect(voice.openedWith).toEqual([LENA.id]);
  });

  it('says how to begin until someone has spoken', async () => {
    const { voice } = await live();
    expect(screen.getByText('Just talk. You can interrupt Lena at any time.')).toBeTruthy();

    await play(voice, SESSION_CREATED, personaSaid('Hallo Amara! Wie war dein Tag?'));

    expect(screen.getByText('Hallo Amara! Wie war dein Tag?')).toBeTruthy();
    expect(screen.queryByText('Just talk. You can interrupt Lena at any time.')).toBeNull();
  });

  it('says who is speaking and shows what the learner said', async () => {
    const { voice } = await live();

    await play(voice, SESSION_CREATED, AUDIO_STARTED);
    expect(screen.getByText('Lena is speaking')).toBeTruthy();

    await play(voice, AUDIO_STOPPED, learnerSaid('Mein Tag war gut.'));
    expect(screen.getByText('Mein Tag war gut.')).toBeTruthy();
  });

  it('shows how much time is left once the call is live', async () => {
    const voice = createFakeVoiceEngine();
    const release = voice.holdStart();
    await open({ voice });
    await screen.findByText('Connecting…');
    expect(screen.queryByText(/left$/)).toBeNull();

    await act(async () => release());

    expect(await screen.findByText('10:00 left')).toBeTruthy();
  });

  it('mutes and unmutes the microphone', async () => {
    const { voice } = await live();

    await fireEvent.press(screen.getByRole('button', { name: 'Mute microphone' }));
    expect(voice.muted).toBe(true);
    expect(screen.getByText('Your microphone is off')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Unmute microphone' }));
    expect(voice.muted).toBe(false);
  });

  it('asks the partner for help from the help sheet', async () => {
    const { voice } = await live();
    await play(voice, SESSION_CREATED, personaSaid('Was hast du am Wochenende gemacht?'));

    await fireEvent.press(screen.getByRole('button', { name: 'Help' }));
    expect(await screen.findByRole('header', { name: 'Need a hand?' })).toBeTruthy();
    for (const kind of ['I’m stuck', 'Slower', 'Repeat', 'Translate', 'Explain']) {
      expect(screen.getByRole('button', { name: kind })).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Slower' }));

    expect(voice.helped).toEqual(['slower']);
    await waitFor(() => expect(screen.queryByRole('header', { name: 'Need a hand?' })).toBeNull());
    expect(screen.getByText('Lena is thinking')).toBeTruthy();
  });

  it('offers no help before the call is live', async () => {
    const voice = createFakeVoiceEngine();
    voice.holdStart();
    await open({ voice });
    await screen.findByText('Connecting…');

    expect(screen.getByRole('button', { name: 'Help' })).toBeDisabled();
  });

  it('hides what the partner says for listening practice, and shows it again', async () => {
    const { voice } = await live();
    await play(voice, SESSION_CREATED, personaSaid('Was hast du am Wochenende gemacht?'));
    await fireEvent.press(screen.getByRole('button', { name: 'Help' }));

    await fireEvent.press(await screen.findByRole('switch', { name: 'Show what Lena says' }));

    expect(screen.queryByText('Was hast du am Wochenende gemacht?')).toBeNull();
    expect(screen.getByText('Lena’s words are hidden. Listen closely.')).toBeTruthy();
    expect(getPreferences().partnerCaptions).toBe(false);

    await fireEvent.press(screen.getByRole('switch', { name: 'Show what Lena says' }));

    expect(screen.getByText('Was hast du am Wochenende gemacht?')).toBeTruthy();
  });

  it('rehearses the role-play that was chosen and ticks off its goals', async () => {
    const { voice } = await live({ scenario: 'bakery' });

    expect(voice.openedScenarios).toEqual(['bakery']);
    expect(await screen.findByLabelText('Order two things: still to do')).toBeTruthy();
    expect(screen.getByLabelText('Pay and say goodbye: still to do')).toBeTruthy();

    await play(voice, {
      type: 'conversation.item.done',
      item: {
        id: 'item_out',
        type: 'function_call_output',
        call_id: 'call_1',
        output: JSON.stringify({ task: 'order', reached: 1, goals: 3 }),
      },
    });

    expect(screen.getByLabelText('Order two things: reached')).toBeTruthy();
  });

  it('practises the grammar topic that was chosen', async () => {
    const { voice } = await live({ practise: 'dative' });

    expect(voice.openedPractise).toEqual(['dative']);
  });

  it('shows no goals in a free conversation', async () => {
    const { voice } = await live();

    expect(voice.openedScenarios).toEqual([undefined]);
    expect(screen.queryByLabelText(/still to do$/)).toBeNull();
  });

  it('shows a mistake found while the learner speaks, and why when it is tapped', async () => {
    const { voice } = await live();
    await play(voice, SESSION_CREATED, learnerSaid('Ich habe nach Berlin gefahren.'));

    await play(voice, liveCorrection('item_u', PERFEKT));

    const chip = await screen.findByRole('button', {
      name: 'You said “Ich habe nach Berlin gefahren”. Better: “Ich bin nach Berlin gefahren”.',
    });
    await fireEvent.press(chip);

    expect(await screen.findByRole('header', { name: 'Let’s polish this' })).toBeTruthy();
    expect(screen.getByText('With fahren, the Perfekt takes sein.')).toBeTruthy();
    expect(screen.getByText('Perfekt: haben or sein')).toBeTruthy();
    expect(screen.getByText('Your report checks this again after the conversation.')).toBeTruthy();
  });

  it('keeps showing the latest corrections when the learner speaks again', async () => {
    const { voice } = await live();
    await play(
      voice,
      learnerSaid('Ich habe nach Berlin gefahren.'),
      liveCorrection('item_u', PERFEKT),
    );

    await play(voice, { ...learnerSaid('Und dann?'), item_id: 'item_v' });

    expect(
      screen.getByRole('button', { name: /^You said “Ich habe nach Berlin gefahren”/ }),
    ).toBeTruthy();
  });

  it('keeps corrections for the report when the learner hid them', async () => {
    const { voice } = await live();
    await fireEvent.press(screen.getByRole('button', { name: 'Help' }));
    await fireEvent.press(
      await screen.findByRole('switch', { name: 'Show corrections as I speak' }),
    );
    expect(getPreferences().liveCorrections).toBe(false);

    await play(
      voice,
      learnerSaid('Ich habe nach Berlin gefahren.'),
      liveCorrection('item_u', PERFEKT),
    );

    expect(screen.queryByRole('button', { name: /^You said/ })).toBeNull();
  });

  it('shows what the conversation practises and ticks off each word once it is used', async () => {
    const voice = createFakeVoiceEngine();
    voice.plan = {
      language: 'de',
      focus: ['dative'],
      words: [
        { text: 'der Termin', meaning: 'appointment' },
        { text: 'umsteigen', meaning: 'to change trains' },
      ],
    };
    await live({ voice });

    expect(screen.getByText('Practising today: Dative')).toBeTruthy();
    expect(screen.getByText('Words to use: 0 of 2')).toBeTruthy();
    expect(screen.getByLabelText('der Termin: not used yet')).toBeTruthy();

    await play(voice, learnerSaid('Ich habe morgen einen Termin.'));

    expect(screen.getByLabelText('der Termin: used')).toBeTruthy();
    expect(screen.getByLabelText('umsteigen: not used yet')).toBeTruthy();
    expect(screen.getByText('Words to use: 1 of 2')).toBeTruthy();
  });

  it('shows no plan when there is nothing to practise yet', async () => {
    const voice = createFakeVoiceEngine();
    voice.plan = { language: 'de', focus: [], words: [] };
    await live({ voice });

    expect(screen.queryByText(/^Practising today/)).toBeNull();
    expect(screen.queryByText(/^Words to use/)).toBeNull();
  });

  it('ends the call when the learner ends it and shows what it added up to', async () => {
    const { voice } = await live();

    await fireEvent.press(screen.getByRole('button', { name: 'End conversation' }));

    expect(voice.stops).toBeGreaterThan(0);
    expect(router.replace).toHaveBeenCalledWith(DONE);
  });

  it('moves on by itself once the partner has said goodbye', async () => {
    const { voice } = await live();

    await play(voice, SESSION_CREATED, ENDED_BY_PARTNER, AUDIO_STARTED);
    expect(screen.getByText('Saying goodbye…')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();

    await play(voice, AUDIO_STOPPED);

    expect(router.replace).toHaveBeenCalledWith(DONE);
  });

  it('treats a call the server ended (its time was up) as a finished conversation', async () => {
    const { voice } = await live();

    await play(voice, SESSION_CREATED, { type: 'connection.lost' });

    expect(router.replace).toHaveBeenCalledWith(DONE);
  });

  it.each([
    [
      'minutes_used_up',
      'You’ve used this week’s voice minutes. They come back on Monday, October 12.',
    ],
    [
      'voice_paused',
      'Voice conversations are paused for now. Your cards, reports and the tutor still work.',
    ],
    ['mic_denied', /^Konvami can’t use the microphone/],
    ['unsupported', 'Voice needs the full Konvami app. It isn’t available in this preview.'],
    ['network', 'Can’t reach Konvami. Check your connection and try again.'],
    ['unknown', 'Something went wrong. Please try again.'],
  ] as const)('says why a call could not start: %s', async (code, message) => {
    const voice = createFakeVoiceEngine();
    voice.failNextStart(code);
    await open({ voice });

    expect(await screen.findByText(message)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each([
    'minutes_used_up',
    'voice_paused',
    'unsupported',
    'consent_required',
    'no_microphone',
  ] as const)('does not offer another try when trying again cannot help: %s', async (code) => {
    const voice = createFakeVoiceEngine();
    voice.failNextStart(code);
    await open({ voice });

    expect(await screen.findByRole('button', { name: 'Back to Today' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('starts a fresh call when the learner tries again', async () => {
    const voice = createFakeVoiceEngine();
    voice.failNextStart('voice_unavailable');
    await open({ voice });
    await screen.findByText('Voice isn’t available right now. Try again in a moment.');

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(/left$/)).toBeTruthy();
    expect(voice.starts).toBe(2);
  });

  it('leads back to Today from a call that could not start', async () => {
    const voice = createFakeVoiceEngine();
    voice.failNextStart('minutes_used_up');
    await open({ voice });
    await screen.findByText(/this week’s voice minutes/);

    await fireEvent.press(screen.getByRole('button', { name: 'Back to Today' }));

    // Back down to the tabs that are already open, not a second copy on top of them.
    expect(router.dismissTo).toHaveBeenCalledWith('/today');
  });

  it('just goes back when the learner leaves before the call is connected', async () => {
    const voice = createFakeVoiceEngine();
    const release = voice.holdStart();
    await open({ voice });
    await screen.findByText('Connecting…');

    await fireEvent.press(screen.getByRole('button', { name: 'End conversation' }));

    expect(router.back).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => release());
  });

  it('says so when the partner no longer exists, without starting a call', async () => {
    const { voice } = await open({ personaId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009' });

    expect(await screen.findByText('This partner is no longer there.')).toBeTruthy();
    expect(voice.starts).toBe(0);
  });

  it('sends someone who is not signed in to the start', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ personaId: LENA.id });
    await renderScreen(<LiveConversationScreen />, { api: inApp() });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});

describe('5.4 Conversation done', () => {
  async function open(api: FakeApi, id = FAKE_CALL_ID) {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id });
    await renderScreen(<ConversationDoneScreen />, { api, signedIn: true });
    return api;
  }

  const reads = (api: FakeApi, method: string) =>
    api.calls.filter(([called]) => called === method).length;

  it('says what the conversation added up to', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID, minutes: 8 });
    await open(api);

    expect(await screen.findByRole('header', { name: 'Nice talking, Amara!' })).toBeTruthy();
    expect(screen.getByText('You talked with Lena for 8 min.')).toBeTruthy();
    // The streak comes with Today's numbers, which are read again once the conversation is saved.
    expect(await screen.findByText('1-day streak')).toBeTruthy();
  });

  it('says how many of a role-play’s goals the learner reached', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID, scenario: 'bakery', goalsReached: ['order', 'price'] });
    await open(api);

    expect(await screen.findByText('Goals reached: 2 of 3')).toBeTruthy();
    expect(screen.getByLabelText('Order two things: reached')).toBeTruthy();
    expect(screen.getByLabelText('Pay and say goodbye: still to do')).toBeTruthy();
  });

  it('counts no goals after a free conversation', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID });
    await open(api);

    await screen.findByRole('header', { name: 'Nice talking, Amara!' });
    expect(screen.queryByText(/^Goals reached/)).toBeNull();
  });

  it('waits while the conversation is being saved', async () => {
    jest.useFakeTimers();
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID, ended: false });
    await open(api);
    expect(await screen.findByText('Saving your conversation…')).toBeTruthy();

    api.finish(FAKE_CALL_ID, { minutes: 3 });
    await act(() => jest.advanceTimersByTimeAsync(2000));

    expect(screen.getByText('You talked with Lena for 3 min.')).toBeTruthy();
  });

  it('brings Today and the library up to date once the conversation is saved', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID, minutes: 8 });
    await open(api);
    await screen.findByRole('header', { name: 'Nice talking, Amara!' });

    await waitFor(() => expect(reads(api, 'getHome')).toBe(1));
  });

  it('says so kindly when nothing was said, and does not call it practice', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID, minutes: 1, learnerSays: [] });
    await open(api);

    expect(await screen.findByRole('header', { name: 'That was a quick one' })).toBeTruthy();
    expect(screen.queryByText(/streak/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Read the transcript' })).toBeNull();
  });

  it('stops waiting after a while and says where the conversation will appear', async () => {
    jest.useFakeTimers();
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID, ended: false });
    await open(api);
    await screen.findByText('Saving your conversation…');

    await act(() => jest.advanceTimersByTimeAsync(60_000));

    expect(
      screen.getByRole('header', { name: 'Your conversation is still being saved' }),
    ).toBeTruthy();
    expect(screen.getByText('It will appear in your library in a moment.')).toBeTruthy();
  });

  it('says the same when the conversation cannot be read', async () => {
    const api = inApp();
    api.failNext('getConversation', 'network');
    await open(api);

    expect(
      await screen.findByRole('header', { name: 'Your conversation is still being saved' }),
    ).toBeTruthy();
  });

  it('opens the transcript', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID });
    await open(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'Read the transcript' }));

    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/conversations/[id]',
      params: { id: FAKE_CALL_ID },
    });
  });

  it('says that the report is being written', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID });
    api.reported(FAKE_CALL_ID, 'pending');
    await open(api);

    expect(await screen.findByText('Writing your report…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'See my report' })).toBeNull();
  });

  it('offers the report as soon as it is written, with what is in it', async () => {
    jest.useFakeTimers();
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID });
    api.reported(FAKE_CALL_ID, 'pending');
    await open(api);
    await screen.findByText('Writing your report…');

    api.reported(FAKE_CALL_ID);
    await act(() => jest.advanceTimersByTimeAsync(POLL_MS));

    expect(screen.getByText('Your report is ready')).toBeTruthy();
    expect(screen.getByText('2 things to polish · 2 words to keep')).toBeTruthy();
    expect(screen.queryByText('Writing your report…')).toBeNull();
  });

  it('opens the report, and still leads back to Today', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID });
    api.reported(FAKE_CALL_ID);
    await open(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'See my report' }));

    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/conversations/[id]/report',
      params: { id: FAKE_CALL_ID },
    });
    expect(screen.getByRole('button', { name: 'Back to Today' })).toBeTruthy();
  });

  it('counts only what a report has', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID });
    api.reported(FAKE_CALL_ID, {
      ...FAKE_REPORT,
      mistakes: FAKE_REPORT.mistakes.slice(0, 1),
      words: [],
    });
    await open(api);

    expect(await screen.findByText('1 thing to polish')).toBeTruthy();
  });

  it('says so when the report could not be written', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID });
    api.reported(FAKE_CALL_ID, 'failed');
    await open(api);

    expect(
      await screen.findByText(
        'Your report couldn’t be written this time. You can ask for it again from the transcript.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Read the transcript' })).toBeTruthy();
  });

  it('says so when the learner said too little for a report, so they know why none comes', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID });
    api.reported(FAKE_CALL_ID, 'too_short');
    await open(api);

    expect(
      await screen.findByText(
        'Too short for a report this time. Talk a little longer and you’ll get one.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'See my report' })).toBeNull();
  });

  it('says nothing about a report when none was asked for', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID });
    await open(api);
    await screen.findByRole('header', { name: 'Nice talking, Amara!' });

    await waitFor(() => expect(reads(api, 'getConversationReport')).toBe(1));
    expect(screen.queryByText(/report/i)).toBeNull();
  });

  it('does not ask for the report of a call in which nothing was said', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID, learnerSays: [] });
    await open(api);
    await screen.findByRole('header', { name: 'That was a quick one' });

    expect(reads(api, 'getConversationReport')).toBe(0);
  });

  it('leads back to Today', async () => {
    const api = inApp();
    api.talked(0, { id: FAKE_CALL_ID });
    await open(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'Back to Today' }));

    expect(router.dismissTo).toHaveBeenCalledWith('/today');
  });
});
