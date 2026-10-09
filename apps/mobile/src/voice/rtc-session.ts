import { VoiceError } from './errors';

/**
 * One WebRTC connection to a live voice call: the microphone going out, the persona's voice
 * coming in, and a data channel carrying the call's events. The platform's WebRTC is passed in
 * (`RtcPrimitives`), so the same code runs in the browser and on phones, and is unit tested with
 * a stand-in.
 */

/** The parts of the platform's WebRTC this file uses (the same shape on web and native). */
export interface RtcTrack {
  kind: string;
  enabled: boolean;
  stop(): void;
}

export interface RtcStream {
  getTracks(): RtcTrack[];
}

export interface RtcChannel {
  readyState: string;
  send(data: string): void;
  close(): void;
  addEventListener(name: 'message', listener: (event: { data: unknown }) => void): void;
}

export interface RtcPeer {
  connectionState: string;
  onconnectionstatechange: (() => void) | null;
  ontrack: ((event: { streams: readonly unknown[] }) => void) | null;
  addTrack(track: RtcTrack, stream: RtcStream): unknown;
  createDataChannel(label: string): RtcChannel;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(description: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(description: { type: 'answer'; sdp: string }): Promise<void>;
  getStats(): Promise<{ forEach(callback: (report: Record<string, unknown>) => void): void }>;
  close(): void;
}

export interface MicrophoneOptions {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export interface RtcPrimitives {
  createPeer(): RtcPeer;
  /** Asks for the microphone. Rejects with the platform's error (`NotAllowedError`, …). */
  getMicrophone(options: MicrophoneOptions): Promise<RtcStream>;
  /** Plays the persona's voice. On phones the WebRTC stack plays it by itself. */
  playAudio(stream: unknown): void;
}

/** How loud each side is right now, 0 (silence) to 1. */
export interface AudioLevels {
  persona: number;
  learner: number;
}

export interface RtcSession {
  /** Asks for the microphone and returns the SDP offer. Rejects with a `VoiceError`. */
  offer(): Promise<string>;
  accept(answerSdp: string): Promise<void>;
  onEvent(listener: (event: unknown) => void): void;
  /** Called once if the connection is lost (not when `close()` ends it). */
  onClosed(listener: () => void): void;
  setMuted(muted: boolean): void;
  /** Sends an event to the provider. False when the events channel is not open (yet, or any more). */
  send(event: unknown): boolean;
  levels(): Promise<AudioLevels>;
  close(): void;
}

// The name the voice provider expects for the events channel.
const EVENTS_CHANNEL = 'oai-events';
// Speech needs the phone's voice processing: without echo cancellation the persona hears herself.
const MICROPHONE: MicrophoneOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
const LOST_STATES = ['failed', 'closed', 'disconnected'];
const MICROPHONE_ERRORS: Record<string, 'mic_denied' | 'no_microphone'> = {
  NotAllowedError: 'mic_denied',
  SecurityError: 'mic_denied',
  NotFoundError: 'no_microphone',
  OverconstrainedError: 'no_microphone',
};

const level = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;

export function createRtcSession(primitives: RtcPrimitives): RtcSession {
  const peer = primitives.createPeer();
  const channel = peer.createDataChannel(EVENTS_CHANNEL);
  let microphone: RtcStream | null = null;
  let closed = false;
  let onEvent: (event: unknown) => void = () => {};
  let onClosed: () => void = () => {};

  peer.ontrack = (event) => {
    if (event.streams[0]) primitives.playAudio(event.streams[0]);
  };
  peer.onconnectionstatechange = () => {
    if (!closed && LOST_STATES.includes(peer.connectionState)) {
      closed = true;
      onClosed();
    }
  };
  channel.addEventListener('message', (message) => {
    try {
      onEvent(JSON.parse(String(message.data)));
    } catch {
      // Not an event: nothing to act on.
    }
  });

  function close() {
    if (closed && !microphone) return;
    closed = true;
    microphone?.getTracks().forEach((track) => track.stop());
    microphone = null;
    channel.close();
    peer.close();
  }

  return {
    async offer() {
      try {
        microphone = await primitives.getMicrophone(MICROPHONE);
      } catch (error) {
        closed = true;
        channel.close();
        peer.close();
        throw new VoiceError(
          MICROPHONE_ERRORS[(error as { name?: string })?.name ?? ''] ?? 'unknown',
        );
      }
      const stream = microphone;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      return offer.sdp ?? '';
    },

    accept: (answerSdp) => peer.setRemoteDescription({ type: 'answer', sdp: answerSdp }),

    onEvent(listener) {
      onEvent = listener;
    },

    onClosed(listener) {
      onClosed = listener;
    },

    setMuted(muted) {
      microphone?.getTracks().forEach((track) => {
        track.enabled = !muted;
      });
    },

    send(event) {
      if (closed || channel.readyState !== 'open') return false;
      channel.send(JSON.stringify(event));
      return true;
    },

    async levels() {
      const levels: AudioLevels = { persona: 0, learner: 0 };
      const stats = await peer.getStats();
      stats.forEach((report) => {
        if (report.kind !== 'audio') return;
        if (report.type === 'inbound-rtp') levels.persona = level(report.audioLevel);
        if (report.type === 'media-source') levels.learner = level(report.audioLevel);
      });
      return levels;
    },

    close,
  };
}
