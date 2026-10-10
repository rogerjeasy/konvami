import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * Plays a voice's sample in Persona Studio: one short clip at a time. Replaced in tests.
 */
export interface SamplePlayer {
  /**
   * Plays the clip at `url` from its start, stopping the one before it. `onDone` is called
   * once, when the clip has ended or was stopped.
   */
  play(url: string, onDone: () => void): void;
  stop(): void;
}

// A sample is one sentence. If its end is never reported (the clip could not be loaded), the
// player gives up after this long (ms) instead of showing "playing" forever.
const SAMPLE_MAX_MS = 20_000;

export function createSamplePlayer(): SamplePlayer {
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
    play(url, onDone) {
      stop();
      // A preview the learner asked for should be heard with the ringer switch off, too.
      void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      const player = createAudioPlayer({ uri: url });
      const listener = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) stop();
      });
      current = { player, listener, timer: setTimeout(stop, SAMPLE_MAX_MS), done: onDone };
      player.play();
    },
    stop,
  };
}
