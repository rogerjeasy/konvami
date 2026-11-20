import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryEpisode } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { usePracticeServices } from '@/practice/services';
import { stepFeedback } from '@/lib/haptics';

// How often an episode being written is read again (ms): writing and speaking it takes the
// worker a little while, as for a pen-pal note.
export const POLL_MS = 3000;

export type EpisodeState =
  | { phase: 'loading' }
  | { phase: 'failed'; code: string }
  | { phase: 'ready'; episode: StoryEpisode };

/**
 * One episode of the listening series (5.29). It is read again while it is being written, so a
 * pending episode turns into the finished one on its own; `update` shows a newer copy (after
 * the learner listened to the end). A failure while reading again keeps what is shown.
 */
export function useEpisode(id: string | undefined): {
  state: EpisodeState;
  update: (episode: StoryEpisode) => void;
} {
  const { readStory } = usePracticeServices();
  const [state, setState] = useState<EpisodeState>({ phase: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!id) return;
    let current = true;
    readStory(id).then(
      (episode) => current && setState({ phase: 'ready', episode }),
      (error: unknown) =>
        current &&
        setState((shown) =>
          shown.phase === 'ready' ? shown : { phase: 'failed', code: apiErrorCode(error) },
        ),
    );
    return () => {
      current = false;
    };
  }, [readStory, id, tick]);

  const writing = state.phase === 'ready' && state.episode.status === 'pending';
  useEffect(() => {
    if (!writing) return;
    const timer = setTimeout(() => setTick((count) => count + 1), POLL_MS);
    return () => clearTimeout(timer);
  }, [writing, tick]);

  const update = useCallback((episode: StoryEpisode) => setState({ phase: 'ready', episode }), []);
  return { state, update };
}

/**
 * Plays an episode's lines one after the other, as one story: play starts at the line shown
 * (or the first), pause stops and keeps the place, and the end of the last line calls `onEnd`.
 * `rate` slows it down or speeds it up from the next line on.
 */
export function useStoryPlayer(lines: readonly { audioUrl?: string | null }[], onEnd: () => void) {
  const { clips } = usePracticeServices();
  const [line, setLine] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  // Which start of a line may go on to the next: a clip stopped or replaced may not.
  const token = useRef(0);
  const latest = useRef({ lines, onEnd, rate });
  useEffect(() => {
    latest.current = { lines, onEnd, rate };
  });
  // The next line is started through this, so a line's end reaches the latest `playFrom`.
  const advance = useRef<(index: number) => void>(() => {});

  useEffect(
    () => () => {
      token.current += 1;
      clips.stop();
    },
    [clips],
  );

  const playFrom = useCallback(
    (index: number) => {
      const { lines: all } = latest.current;
      // A line without a sound is skipped (a text-only episode reads with the captions on).
      let next = index;
      while (next < all.length && !all[next]?.audioUrl) next += 1;
      const url = all[next]?.audioUrl;
      if (!url) {
        setPlaying(false);
        setLine(0);
        latest.current.onEnd();
        return;
      }
      const mine = ++token.current;
      setLine(next);
      setPlaying(true);
      clips.play(
        url,
        () => {
          if (token.current === mine) advance.current(next + 1);
        },
        undefined,
        latest.current.rate,
      );
    },
    [clips],
  );
  useEffect(() => {
    advance.current = playFrom;
  }, [playFrom]);

  function toggle() {
    stepFeedback();
    if (playing) {
      token.current += 1;
      setPlaying(false);
      clips.stop();
    } else {
      playFrom(line);
    }
  }

  return { line, playing, rate, setRate, toggle, playFrom };
}
