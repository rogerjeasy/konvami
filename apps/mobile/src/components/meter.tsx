import { useMemo } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { motion, size } from '@konvami/design-tokens';
import { Animate } from '@/components/motion';
import { Text } from '@/components/text';
import { fillKeyframes } from '@/lib/motion';

/**
 * A share of a whole as a bar that fills to it, with the number beside it when there is one to
 * show (the learner's part of the talking, the reviews they remembered, a milestone's progress).
 * A screen reader hears `label` and the share as a percentage.
 */
export function Meter({
  share,
  label,
  value,
  delay = motion.enter,
}: {
  /** From 0 to 1. */
  share: number;
  /** What the bar shows, as a sentence. */
  label: string;
  /** The share as the learner reads it ("61%"), drawn large before the bar. */
  value?: string;
  /** Milliseconds before the bar starts to fill. */
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const fill = useMemo(() => fillKeyframes(reduced), [reduced]);
  const bounded = Math.min(Math.max(share, 0), 1);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(bounded * 100) }}
      className="flex-row items-center gap-3"
    >
      {value ? <Text variant="stat">{value}</Text> : null}
      <View
        style={{ height: size.meterHeight }}
        className="flex-1 overflow-hidden rounded-pill bg-track"
      >
        <Animate
          keyframes={fill}
          duration={motion.slow}
          delay={delay}
          style={{ width: `${bounded * 100}%`, height: '100%', transformOrigin: 'left' }}
        >
          <View className="flex-1 rounded-pill bg-primary" />
        </Animate>
      </View>
    </View>
  );
}
