import { View } from 'react-native';
import { motion } from '@konvami/design-tokens';
import { Loop, Pop } from '@/components/motion';
import { useTheme } from '@/theme';

// The drawing's own geometry, as parts of its box: two half discs and the gap between them.
const DISC = 0.42;
const GAP = 0.06;
// How far each half drifts towards the other while it looks (a part of the box).
const DRIFT = 0.05;

/**
 * Two halves of one disc, tomato and lime, that drift towards each other and apart: the
 * picture of a search for the other half (7.3). Decorative: hidden from screen readers and
 * touches, scaled with its box, and still when Reduce Motion is on (`Loop`).
 */
export function HalvesMotif({ size, searching = true }: { size: number; searching?: boolean }) {
  const { color } = useTheme();
  const disc = size * DISC;
  const drift = size * DRIFT;
  const half = (side: 'left' | 'right') => {
    const toward = side === 'left' ? drift : -drift;
    return (
      <Loop
        keyframes={{
          from: { transform: [{ translateX: 0 }] },
          to: { transform: [{ translateX: toward }] },
        }}
        duration={motion.breathe}
        alternate
        play={searching}
      >
        <View
          style={{
            width: disc / 2,
            height: disc,
            backgroundColor: side === 'left' ? color.tomato : color.lime,
            borderTopLeftRadius: side === 'left' ? disc : 0,
            borderBottomLeftRadius: side === 'left' ? disc : 0,
            borderTopRightRadius: side === 'right' ? disc : 0,
            borderBottomRightRadius: side === 'right' ? disc : 0,
          }}
        />
      </Loop>
    );
  };
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={{ width: size, height: size }}
      className="items-center justify-center"
    >
      <Pop>
        <View className="flex-row items-center" style={{ gap: size * GAP }}>
          {half('left')}
          {half('right')}
        </View>
      </Pop>
    </View>
  );
}
