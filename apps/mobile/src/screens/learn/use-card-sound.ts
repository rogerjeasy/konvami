import type { PlayState } from '@/components/play-button';
import { useSound } from '@/hooks/use-sound';
import { usePracticeServices } from '@/practice/services';

/** Plays a card's sound, made by the server the first time it is asked for. */
export function useCardSound(cardId: string): { state: PlayState; toggle: () => void } {
  const { cardSound } = usePracticeServices();
  return useSound(cardId, cardSound);
}
