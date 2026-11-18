import { useMemo, type ReactNode } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { motion } from '@konvami/design-tokens';
import { Animate } from '@/components/motion';
import type { Keyframes } from '@/lib/motion';

// The card turns about its vertical axis, seen from this far (pt): close enough to feel like a
// card in the hand, far enough that its edge never looks stretched.
const PERSPECTIVE = 1200;
// It starts edge-on, as if the pink side had just turned away.
const EDGE_ON = '90deg';

function flipKeyframes(reduced: boolean): Keyframes {
  if (reduced) return { from: { opacity: 0 }, to: { opacity: 1 } };
  return {
    from: { opacity: 0, transform: [{ perspective: PERSPECTIVE }, { rotateY: EDGE_ON }] },
    to: { opacity: 1, transform: [{ perspective: PERSPECTIVE }, { rotateY: '0deg' }] },
  };
}

/**
 * The answer side of a flashcard turning into view: transform and opacity only, on the UI
 * thread. With Reduce Motion it fades in.
 */
export function FlipIn({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const keyframes = useMemo(() => flipKeyframes(reduced), [reduced]);
  return (
    <Animate keyframes={keyframes} duration={motion.slow}>
      {children}
    </Animate>
  );
}
