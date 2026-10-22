import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * Plays one short clip at a time: a voice's sample in Persona Studio, a turn of a recorded
 * conversation. Starting a clip stops the one before it. Replaced in tests.
 */
export interface ClipPlayer {
  /**
   * Plays the clip at `url` from its start, stopping the one before it. `onDone` is called
   * once, when the clip has ended or was stopped. `lengthMs` is how long the clip is, when
   * known; without it the clip counts as a sample.
   */
  play(url: string, onDone: () => void, lengthMs?: number): void;
  stop(): void;
}

// A sample is one sentence. If a clip's end is never reported (it could not be loaded), the
// player gives up this long after it should have ended (ms) instead of showing "playing"
// forever.
const SAMPLE_MS = 15_000;
const END_MARGIN_MS = 5_000;

export function createClipPlayer(): ClipPlayer {
  let current: {
    player: AudioPlayer;
    listener: { remove: () => void };
    timer: ReturnType<typeof setTimeout>;
    done: () => void;
  } | null = null;

  function stop() {
    if (!current) return;
    const { player, listener, timer, done } = current;
    current = null;
    clearTimeout(timer);
    listener.remove();
    player.remove();
    done();
  }

  return {
    play(url, onDone, lengthMs = SAMPLE_MS) {
      stop();
      // A clip the learner asked for should be heard with the ringer switch off, too.
      void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      const player = createAudioPlayer({ uri: url });
      const listener = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) stop();
      });
      const timer = setTimeout(stop, lengthMs + END_MARGIN_MS);
      current = { player, listener, timer, done: onDone };
      player.play();
    },
    stop,
  };
}
