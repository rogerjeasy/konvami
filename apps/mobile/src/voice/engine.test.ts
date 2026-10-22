import { ApiError } from '@konvami/api-client';
import { createVoiceEngine, VoiceError } from './engine';
import type { RtcSession } from './rtc-session';

function fakeSession(overrides: Partial<RtcSession> = {}) {
  let listener: (event: unknown) => void = () => {};
  let closedListener: () => void = () => {};
  const session: RtcSession = {
    offer: jest.fn(async () => 'v=0 offer'),
    accept: jest.fn(async () => {}),
    onEvent: (next) => void (listener = next),
    onClosed: (next) => void (closedListener = next),
    setMuted: jest.fn(),
    send: jest.fn(() => true),
    levels: jest.fn(async () => ({ persona: 0.3, learner: 0.1 })),
    close: jest.fn(),
    ...overrides,
  };
  return { session, emit: (event: unknown) => listener(event), drop: () => closedListener() };
}

const answer = { callId: 'rtc_1', sdp: 'v=0 answer', maxSeconds: 480 };

describe('starting', () => {
  it('trades the offer for the server’s answer and reports the call and its time limit', async () => {
    const { session } = fakeSession();
    const startCall = jest.fn(async () => answer);
    const engine = createVoiceEngine({ createSession: () => session, startCall });

    expect(await engine.start()).toEqual({ callId: 'rtc_1', maxSeconds: 480 });
    expect(startCall).toHaveBeenCalledWith('v=0 offer');
    expect(session.accept).toHaveBeenCalledWith('v=0 answer');
  });

  it('says so when this build cannot make voice calls', async () => {
    const engine = createVoiceEngine({ createSession: () => null, startCall: jest.fn() });

    await expect(engine.start()).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('passes on a refused microphone without calling the server', async () => {
    const { session } = fakeSession({
      offer: jest.fn(async () => {
        throw new VoiceError('mic_denied');
      }),
    });
    const startCall = jest.fn();
    const engine = createVoiceEngine({ createSession: () => session, startCall });

    await expect(engine.start()).rejects.toMatchObject({ code: 'mic_denied' });
    expect(startCall).not.toHaveBeenCalled();
  });

  it.each([
    ['consent_required', 'consent_required'],
    ['minutes_used_up', 'minutes_used_up'],
    ['voice_paused', 'voice_paused'],
    ['voice_unavailable', 'voice_unavailable'],
    ['network', 'network'],
    ['not_configured', 'voice_unavailable'],
    ['something_new', 'unknown'],
  ])('reports the server’s refusal %s as %s and frees the microphone', async (apiCode, code) => {
    const { session } = fakeSession();
    const engine = createVoiceEngine({
      createSession: () => session,
      startCall: async () => {
        throw new ApiError(apiCode, 503);
      },
    });

    await expect(engine.start()).rejects.toMatchObject({ code });
    expect(session.close).toHaveBeenCalled();
  });

  it('frees the microphone when the answer cannot be applied', async () => {
    const { session } = fakeSession({
      accept: jest.fn(async () => {
        throw new Error('bad sdp');
      }),
    });
    const engine = createVoiceEngine({
      createSession: () => session,
      startCall: async () => answer,
    });

    await expect(engine.start()).rejects.toMatchObject({ code: 'unknown' });
    expect(session.close).toHaveBeenCalled();
  });
});

describe('a running call', () => {
  async function running() {
    const fake = fakeSession();
    const engine = createVoiceEngine({
      createSession: () => fake.session,
      startCall: async () => answer,
    });
    const events: unknown[] = [];
    const stop = engine.subscribe((event) => events.push(event));
    await engine.start();
    return { ...fake, engine, events, stop };
  }

  it('delivers the call’s events to its listeners until they unsubscribe', async () => {
    const { emit, events, stop } = await running();

    emit({ type: 'session.created' });
    stop();
    emit({ type: 'response.created' });

    expect(events).toEqual([{ type: 'session.created' }]);
  });

  it('reports a dropped connection as an event of its own', async () => {
    const { drop, events } = await running();

    drop();

    expect(events).toEqual([{ type: 'connection.lost' }]);
  });

  it('says a typed line for the learner and asks the persona to answer it', async () => {
    const { engine, session, events } = await running();

    engine.say('I don’t know.');

    expect(jest.mocked(session.send).mock.calls.map(([event]) => event)).toEqual([
      {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'I don’t know.' }],
        },
      },
      { type: 'response.create' },
    ]);
    // The screen shows the line at once, as if it had been spoken.
    expect(events).toEqual([
      { type: 'learner.typed', id: expect.any(String), text: 'I don’t know.' },
    ]);
  });

  it('gives every typed line its own id', async () => {
    const { engine, events } = await running();

    engine.say('One');
    engine.say('Two');

    const ids = events.map((event) => (event as { id: string }).id);
    expect(new Set(ids).size).toBe(2);
  });

  it('shows nothing for a typed line that could not be sent', async () => {
    const { engine, session, events } = await running();
    jest.mocked(session.send).mockReturnValue(false);

    engine.say('I don’t know.');

    expect(events).toEqual([]);
  });

  it('asks the partner for help with a note that is not a line of the learner', async () => {
    const { engine, session, events } = await running();

    engine.help('slower');

    expect(jest.mocked(session.send).mock.calls.map(([event]) => event)).toEqual([
      // A reply still playing stops first: the help is about it.
      { type: 'response.cancel' },
      { type: 'output_audio_buffer.clear' },
      {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'system',
          content: [{ type: 'input_text', text: 'learner_help: slower' }],
        },
      },
      { type: 'response.create' },
    ]);
    expect(events).toEqual([{ type: 'learner.help', kind: 'slower' }]);
  });

  it('asks for no help it could not send', async () => {
    const { engine, session, events } = await running();
    jest.mocked(session.send).mockReturnValue(false);

    engine.help('repeat');

    expect(events).toEqual([]);
  });

  it('mutes, reads levels and stops through the session', async () => {
    const { engine, session } = await running();

    engine.setMuted(true);
    expect(session.setMuted).toHaveBeenCalledWith(true);
    expect(await engine.levels()).toEqual({ persona: 0.3, learner: 0.1 });

    engine.stop();
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('is silent and harmless before it starts and after it stops', async () => {
    const { engine, session } = await running();
    engine.stop();
    engine.stop();
    engine.setMuted(true);

    expect(await engine.levels()).toEqual({ persona: 0, learner: 0 });
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('stops a call that was stopped while it was still starting', async () => {
    const { session } = fakeSession();
    let release: (value: typeof answer) => void = () => {};
    const engine = createVoiceEngine({
      createSession: () => session,
      startCall: () => new Promise((resolve) => (release = resolve)),
    });

    const starting = engine.start();
    await Promise.resolve();
    engine.stop();
    release(answer);

    await expect(starting).rejects.toMatchObject({ code: 'stopped' });
    expect(session.accept).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalled();
  });
});
