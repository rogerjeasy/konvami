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

function readySession() {
  const fake = fakeSession();
  jest.mocked(fake.session.accept).mockImplementation(async () => {
    fake.emit({ type: 'session.created' });
  });
  return fake;
}

const PLAN = {
  language: 'de',
  focus: ['case_dative'],
  words: [{ text: 'der Termin', meaning: 'appointment' }],
  review: false,
  lesson: false,
  material: null,
  rehearse: false,
};
const answer = { callId: 'rtc_1', sdp: 'v=0 answer', maxSeconds: 480, plan: PLAN };

describe('linked practice continuation', () => {
  it('waits for the replacement data channel and rejects push-to-talk until it is ready', async () => {
    const first = fakeSession();
    const second = fakeSession();
    const sessions = [first.session, second.session];
    const engine = createVoiceEngine({
      createSession: () => sessions.shift() ?? null,
      startCall: async () => answer,
      continueCall: async () => answer,
    });
    const events: unknown[] = [];
    engine.subscribe((event) => events.push(event));
    await engine.start();
    engine.setPushToTalk(true);
    first.drop();
    // SDP acceptance alone does not mean commands can reach the partner.
    for (let step = 0; step < 20; step += 1) await Promise.resolve();
    expect(second.session.accept).toHaveBeenCalled();
    expect(events).not.toContainEqual({ type: 'connection.restored', muted: true });
    expect(engine.beginTurn()).toBe(false);
    second.emit({ type: 'session.created' });
    for (let step = 0; step < 20; step += 1) await Promise.resolve();
    expect(events).toContainEqual({ type: 'connection.restored', muted: true });
    expect(engine.beginTurn()).toBe(true);
    engine.stop();
  });

  it('keeps the root and mute setting, then ignores events from the replaced transport', async () => {
    const first = fakeSession();
    const second = readySession();
    const sessions = [first.session, second.session];
    const continueCall = jest.fn(async () => ({ ...answer, maxSeconds: 300 }));
    const endCall = jest.fn(async () => {});
    const engine = createVoiceEngine({
      createSession: () => sessions.shift() ?? null,
      startCall: async () => answer,
      continueCall,
      endCall,
    });
    const events: unknown[] = [];
    const restored = new Promise<void>((resolve) =>
      engine.subscribe((event) => {
        events.push(event);
        if ((event as { type: string }).type === 'connection.restored') resolve();
      }),
    );
    await engine.start();
    engine.setMuted(true);
    first.drop();
    await restored;
    expect(continueCall).toHaveBeenCalledWith('rtc_1', expect.any(String), 'v=0 offer');
    expect(second.session.accept).toHaveBeenCalledWith('v=0 answer');
    expect(second.session.setMuted).toHaveBeenLastCalledWith(true);
    expect(jest.mocked(second.session.setMuted).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(second.session.accept).mock.invocationCallOrder[0]!,
    );
    expect(endCall).not.toHaveBeenCalled();
    first.emit({ type: 'old.event' });
    first.drop();
    expect(events).not.toContainEqual({ type: 'old.event' });
    expect(continueCall).toHaveBeenCalledTimes(1);
    engine.stop();
    engine.stop();
    expect(endCall).toHaveBeenCalledTimes(1);
  });

  it('restores push-to-talk before sending any learner audio after reconnecting', async () => {
    const first = fakeSession();
    const second = readySession();
    const sessions = [first.session, second.session];
    const engine = createVoiceEngine({
      createSession: () => sessions.shift() ?? null,
      startCall: async () => answer,
      continueCall: async () => answer,
    });
    const restored = new Promise<void>((resolve) =>
      engine.subscribe((event) => {
        if ((event as { type: string }).type === 'connection.restored') resolve();
      }),
    );
    await engine.start();
    engine.setPushToTalk(true);
    engine.beginTurn();
    first.drop();
    await restored;
    expect(second.session.setMuted).toHaveBeenLastCalledWith(true);
    second.emit({ type: 'session.created' });
    expect(second.session.send).toHaveBeenCalledWith({
      type: 'session.update',
      session: {
        type: 'realtime',
        audio: { input: { turn_detection: null } },
      },
    });
    engine.stop();
  });

  it('does not accept a late answer after End and finalizes the logical call once', async () => {
    const first = fakeSession();
    const second = readySession();
    const sessions = [first.session, second.session];
    let release!: (value: typeof answer) => void;
    const pending = new Promise<typeof answer>((resolve) => {
      release = resolve;
    });
    let requested!: () => void;
    const asking = new Promise<void>((resolve) => {
      requested = resolve;
    });
    const endCall = jest.fn(async () => {});
    const engine = createVoiceEngine({
      createSession: () => sessions.shift() ?? null,
      startCall: async () => answer,
      continueCall: () => {
        requested();
        return pending;
      },
      endCall,
    });
    await engine.start();
    first.drop();
    await asking;
    engine.stop();
    release(answer);
    await pending;
    expect(second.session.accept).not.toHaveBeenCalled();
    expect(second.session.close).toHaveBeenCalled();
    expect(endCall).toHaveBeenCalledWith('rtc_1');
    expect(endCall).toHaveBeenCalledTimes(1);
  });

  it('never continues a call after its goodbye', async () => {
    const first = fakeSession();
    const continueCall = jest.fn();
    const engine = createVoiceEngine({
      createSession: () => first.session,
      startCall: async () => answer,
      continueCall,
    });
    await engine.start();
    first.emit({
      type: 'conversation.item.done',
      item: {
        type: 'function_call_output',
        output: JSON.stringify({ done: true }),
      },
    });
    first.drop();
    expect(continueCall).not.toHaveBeenCalled();
    engine.stop();
  });

  it('limits a logical call to two replacement transports', async () => {
    const peers = [fakeSession(), readySession(), readySession()];
    const queue = peers.map(({ session }) => session);
    const continueCall = jest.fn(async () => answer);
    const endCall = jest.fn(async () => {});
    const engine = createVoiceEngine({
      createSession: () => queue.shift() ?? null,
      startCall: async () => answer,
      continueCall,
      endCall,
    });
    const events: unknown[] = [];
    engine.subscribe((event) => events.push(event));
    await engine.start();
    for (const peer of peers.slice(0, 2)) {
      const restored = new Promise<void>((resolve) => {
        const unsubscribe = engine.subscribe((event) => {
          if ((event as { type: string }).type === 'connection.restored') {
            unsubscribe();
            resolve();
          }
        });
      });
      peer.drop();
      await restored;
    }
    peers[2]!.drop();
    expect(continueCall).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toEqual({ type: 'connection.lost' });
    expect(endCall).toHaveBeenCalledTimes(1);
  });

  it('ends a stuck handoff within its bounded recovery window', async () => {
    jest.useFakeTimers();
    try {
      const first = fakeSession();
      const second = readySession();
      const peers = [first.session, second.session];
      const endCall = jest.fn(async () => {});
      const engine = createVoiceEngine({
        createSession: () => peers.shift() ?? null,
        startCall: async () => answer,
        continueCall: () => new Promise(() => {}),
        endCall,
      });
      const events: unknown[] = [];
      engine.subscribe((event) => events.push(event));
      await engine.start();
      first.drop();
      await jest.advanceTimersByTimeAsync(30000);
      expect(events.at(-1)).toEqual({ type: 'connection.lost' });
      expect(second.session.close).toHaveBeenCalled();
      expect(endCall).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('starting', () => {
  it('trades the offer for the server’s answer and reports the call, its time limit and plan', async () => {
    const { session } = fakeSession();
    const startCall = jest.fn(async () => answer);
    const engine = createVoiceEngine({ createSession: () => session, startCall });

    expect(await engine.start()).toEqual({ callId: 'rtc_1', maxSeconds: 480, plan: PLAN });
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
  it('commits only a released push-to-talk turn and restores automatic detection', async () => {
    let time = 0;
    const { session } = fakeSession();
    const engine = createVoiceEngine({
      createSession: () => session,
      startCall: async () => answer,
      now: () => time,
    });
    await engine.start();
    engine.setPushToTalk(true);
    expect(session.setMuted).toHaveBeenLastCalledWith(true);
    engine.beginTurn();
    expect(session.setMuted).toHaveBeenLastCalledWith(false);
    time = 200;
    engine.endTurn();
    expect(session.setMuted).toHaveBeenLastCalledWith(true);
    expect(session.send).toHaveBeenCalledWith({ type: 'input_audio_buffer.commit' });
    const count = jest.mocked(session.send).mock.calls.length;
    engine.endTurn();
    expect(jest.mocked(session.send).mock.calls).toHaveLength(count);
    engine.setPushToTalk(false);
    expect(session.send).toHaveBeenLastCalledWith({
      type: 'session.update',
      session: {
        type: 'realtime',
        audio: { input: { turn_detection: { type: 'semantic_vad', eagerness: 'auto' } } },
      },
    });
  });
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
