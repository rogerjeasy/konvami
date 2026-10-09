import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { brand, motion, size } from '@konvami/design-tokens';
import { stepFeedback } from '@/lib/haptics';
import { CSS_EASE_OUT } from '@/lib/motion';

// Space between the knob and the edge of the track (pt).
const INSET = 2;
// How far the knob slides from off to on.
const TRAVEL = size.switchWidth - size.switchThumb - INSET * 2;

/**
 * An on/off switch (51 × 31 pt, inside a 44 pt touch target). `locked` shows a choice that is
 * required and cannot be changed: it stays on, dimmed.
 */
export function Switch({
  label,
  value,
  onValueChange,
  locked = false,
}: {
  /** Accessible name; the visible text sits beside the switch. */
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  locked?: boolean;
}) {
  return (
    <Pressable
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={locked}
      onPress={() => {
        stepFeedback();
        onValueChange(!value);
      }}
      className="min-h-tap justify-center"
    >
      <View
        style={{
          width: size.switchWidth,
          height: size.switchHeight,
          borderRadius: size.switchHeight / 2,
          padding: INSET,
        }}
        className={`justify-center ${value ? 'bg-primary' : 'bg-track'} ${locked ? 'opacity-disabled' : ''}`}
      >
        <Animated.View
          style={{
            width: size.switchThumb,
            height: size.switchThumb,
            borderRadius: size.switchThumb / 2,
            backgroundColor: brand.thumb,
            transform: [{ translateX: value ? TRAVEL : 0 }],
            transitionProperty: 'transform',
            transitionDuration: `${motion.fast}ms`,
            transitionTimingFunction: CSS_EASE_OUT,
          }}
        />
      </View>
    </Pressable>
  );
}
