import { useEffect, useState } from 'react';
import type { PlayState } from '@/components/play-button';
import { usePracticeServices } from '@/practice/services';

/**
 * Plays a sound the server makes the first time it is asked for (a card's, a weekly check-in's):
 * `address` says where `key`'s sound plays from; pressing again stops it. A sound that cannot be
 * had leaves the button as it was.
 */
export function useSound(
  key: string,
  address: (key: string) => Promise<string>,
): { state: PlayState; toggle: () => void } {
  const { clips } = usePracticeServices();
  const [state, setState] = useState<PlayState>('idle');

  // Another sound, or the screen leaving, stops what is playing.
  useEffect(() => () => clips.stop(), [key, clips]);

  return {
    state,
    toggle: () => {
      if (state === 'playing') {
        clips.stop();
        return;
      }
      setState('loading');
      address(key).then(
        (url) => {
          setState('playing');
          clips.play(url, () => setState('idle'));
        },
        () => setState('idle'),
      );
    },
  };
}
