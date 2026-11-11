import { useEffect, useRef, useState } from 'react';
import type { TurnAudio } from '@konvami/api-client';
import { stepFeedback } from '@/lib/haptics';
import { nextRecorded } from '@/lib/playlist';
import { usePracticeServices } from '@/practice/services';

/**
 * Plays the recordings in a list of turns (5.6, 5.20): a turn's recording plays, then the next
 * one that has a recording in its group, and so on, as voice notes in a chat do. One clip plays
 * at a time; leaving the screen stops it.
 */
export function usePlayback(turns: readonly { audio?: TurnAudio | null; group?: string }[]) {
  const { clips } = usePracticeServices();
  const [positionMs, setPositionMs] = useState(0);
  const [rate, updateRate] = useState(1);
  const [loop, updateLoop] = useState(false);
  const options = useRef({ rate, loop });
  options.current = { rate, loop };
  const [playing, setPlaying] = useState<number | null>(null);
  // The turn whose clip may go on to the next; a clip that was stopped or replaced may not.
  const current = useRef<number | null>(null);

  useEffect(
    () => () => {
      current.current = null;
      clips.stop();
    },
    [clips],
  );

  function play(index: number) {
    const audio = turns[index]?.audio;
    if (!audio) return;
    current.current = index;
    setPlaying(index);
    setPositionMs(0);
    clips.play(
      audio.url,
      () => {
        if (current.current !== index) return;
        const next = options.current.loop ? index : nextRecorded(turns, index);
        if (next === null) {
          current.current = null;
          setPlaying(null);
        } else {
          play(next);
        }
      },
      audio.milliseconds,
      options.current.rate,
      (value) => {
        if (current.current === index) setPositionMs(value);
      },
    );
  }

  function toggle(index: number) {
    stepFeedback();
    if (playing === index) {
      current.current = null;
      setPlaying(null);
      clips.stop();
    } else {
      play(index);
    }
  }

  function setRate(value: number) {
    options.current.rate = value;
    updateRate(value);
    if (current.current !== null) {
      const index = current.current;
      current.current = null;
      clips.stop();
      play(index);
    }
  }
  return { playing, positionMs, toggle, rate, setRate, loop, setLoop: updateLoop };
}
