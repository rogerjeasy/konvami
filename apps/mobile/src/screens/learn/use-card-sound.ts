import { useEffect, useState } from 'react';
import type { PlayState } from '@/components/play-button';
import { usePracticeServices } from '@/practice/services';

/**
 * Plays a card's sound, asking the server where it is the first time (it is made then); pressing
 * again stops it. A sound that cannot be had leaves the button as it was.
 */
export function useCardSound(cardId: string): { state: PlayState; toggle: () => void } {
  const { cardSound, clips } = usePracticeServices();
  const [state, setState] = useState<PlayState>('idle');

  // Another card, or the screen leaving, stops what is playing.
  useEffect(() => () => clips.stop(), [cardId, clips]);

  return {
    state,
    toggle: () => {
      if (state === 'playing') {
        clips.stop();
        return;
      }
      setState('loading');
      cardSound(cardId).then(
        (url) => {
          setState('playing');
          clips.play(url, () => setState('idle'));
        },
        () => setState('idle'),
      );
    },
  };
}
