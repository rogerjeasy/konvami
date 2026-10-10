import { createRtcSession, type RtcPrimitives } from './rtc-session';

/** A stand-in for the platform's WebRTC, recording what the session does with it. */
function fakePlatform({ microphone = 'granted' as 'granted' | 'denied' | 'missing' } = {}) {
  const track = { kind: 'audio', enabled: true, stop: jest.fn() };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const channelListeners = new Map<string, (event: { data: string }) => void>();
  const channel = {
    readyState: 'open',
    send: jest.fn(),
    close: jest.fn(),
    addEventListener: (name: string, listener: (event: { data: string }) => void) =>
      void channelListeners.set(name, listener),
  };
  const peer = {
    connectionState: 'new',
    onconnectionstatechange: null as null | (() => void),
    ontrack: null as null | ((event: { streams: readonly unknown[] }) => void),
    addTrack: jest.fn(),
    createDataChannel: jest.fn(() => channel),
    createOffer: jest.fn(async () => ({ type: 'offer', sdp: 'v=0 offer' })),
    setLocalDescription: jest.fn(async () => {}),
    setRemoteDescription: jest.fn(async () => {}),
    getStats: jest.fn(async () => new Map<string, Record<string, unknown>>()),
    close: jest.fn(),
  };
  const playAudio = jest.fn();
  const primitives: RtcPrimitives = {
    createPeer: () => peer,
    getMicrophone: jest.fn(async () => {
      if (microphone === 'granted') return stream;
      throw Object.assign(new Error('refused'), {
        name: microphone === 'denied' ? 'NotAllowedError' : 'NotFoundError',
      });
    }),
    playAudio,
  };
  return { primitives, peer, channel, track, stream, playAudio, channelListeners };
}

describe('setting up the call', () => {
  it('offers the microphone and an events channel', async () => {
    const { primitives, peer, track, stream } = fakePlatform();
    const session = createRtcSession(primitives);

    expect(await session.offer()).toBe('v=0 offer');
    expect(peer.addTrack).toHaveBeenCalledWith(track, stream);
    expect(peer.createDataChannel).toHaveBeenCalledWith('oai-events');
    expect(peer.setLocalDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'v=0 offer' });
  });

  it('asks for a microphone tuned for speech', async () => {
    const { primitives } = fakePlatform();

    await createRtcSession(primitives).offer();

    expect(primitives.getMicrophone).toHaveBeenCalledWith({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it.each([
    ['denied', 'mic_denied'],
    ['missing', 'no_microphone'],
  ] as const)('reports a %s microphone and frees the connection', async (microphone, code) => {
    const { primitives, peer } = fakePlatform({ microphone });

    await expect(createRtcSession(primitives).offer()).rejects.toMatchObject({ code });
    expect(peer.close).toHaveBeenCalled();
  });

  it('takes the provider’s answer', async () => {
    const { primitives, peer } = fakePlatform();
    const session = createRtcSession(primitives);
    await session.offer();

    await session.accept('v=0 answer');

    expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'v=0 answer' });
  });

  it('plays the persona’s voice when it arrives', async () => {
    const { primitives, peer, playAudio } = fakePlatform();
    createRtcSession(primitives);
    const remote = { id: 'remote' };

    peer.ontrack?.({ streams: [remote] });

    expect(playAudio).toHaveBeenCalledWith(remote);
  });
});

describe('during the call', () => {
  it('passes on the provider’s events and drops what is not JSON', async () => {
    const { primitives, channelListeners } = fakePlatform();
    const session = createRtcSession(primitives);
    const events: unknown[] = [];
    session.onEvent((event) => events.push(event));

    channelListeners.get('message')?.({ data: '{"type":"session.created"}' });
    channelListeners.get('message')?.({ data: 'not json' });

    expect(events).toEqual([{ type: 'session.created' }]);
  });

  it('sends an event to the provider over the events channel', async () => {
    const { primitives, channel } = fakePlatform();
    const session = createRtcSession(primitives);

    expect(session.send({ type: 'response.create' })).toBe(true);

    expect(channel.send).toHaveBeenCalledWith('{"type":"response.create"}');
  });

  it('sends nothing while the events channel is not open', async () => {
    const { primitives, channel } = fakePlatform();
    channel.readyState = 'connecting';
    const session = createRtcSession(primitives);

    expect(session.send({ type: 'response.create' })).toBe(false);

    expect(channel.send).not.toHaveBeenCalled();
  });

  it('mutes and unmutes the microphone without ending the call', async () => {
    const { primitives, track, peer } = fakePlatform();
    const session = createRtcSession(primitives);
    await session.offer();

    session.setMuted(true);
    expect(track.enabled).toBe(false);
    session.setMuted(false);
    expect(track.enabled).toBe(true);
    expect(peer.close).not.toHaveBeenCalled();
  });

  it('reads how loud each side is', async () => {
    const { primitives, peer } = fakePlatform();
    const session = createRtcSession(primitives);
    peer.getStats.mockResolvedValue(
      new Map<string, Record<string, unknown>>([
        ['a', { type: 'inbound-rtp', kind: 'audio', audioLevel: 0.42 }],
        ['b', { type: 'media-source', kind: 'audio', audioLevel: 0.08 }],
        ['c', { type: 'inbound-rtp', kind: 'video', audioLevel: 0.9 }],
        ['d', { type: 'candidate-pair', state: 'succeeded' }],
      ]),
    );

    expect(await session.levels()).toEqual({ persona: 0.42, learner: 0.08 });
  });

  it('reads silence when the platform reports no levels', async () => {
    const { primitives } = fakePlatform();

    expect(await createRtcSession(primitives).levels()).toEqual({ persona: 0, learner: 0 });
  });

  it.each(['failed', 'closed', 'disconnected'])(
    'tells its owner when the connection is %s',
    async (state) => {
      const { primitives, peer } = fakePlatform();
      const session = createRtcSession(primitives);
      const closed = jest.fn();
      session.onClosed(closed);

      peer.connectionState = 'connected';
      peer.onconnectionstatechange?.();
      expect(closed).not.toHaveBeenCalled();

      peer.connectionState = state;
      peer.onconnectionstatechange?.();
      expect(closed).toHaveBeenCalledTimes(1);
    },
  );
});

describe('ending the call', () => {
  it('releases the microphone and the connection, once', async () => {
    const { primitives, peer, track, channel } = fakePlatform();
    const session = createRtcSession(primitives);
    await session.offer();

    session.close();
    session.close();

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it('does not report its own closing as a lost connection', async () => {
    const { primitives, peer } = fakePlatform();
    const session = createRtcSession(primitives);
    const closed = jest.fn();
    session.onClosed(closed);

    session.close();
    peer.connectionState = 'closed';
    peer.onconnectionstatechange?.();

    expect(closed).not.toHaveBeenCalled();
  });
});
