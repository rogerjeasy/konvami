import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { motion, size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';
import { CSS_EASE_OUT } from '@/lib/motion';
import { useTheme } from '@/theme';

// The round mark at the end of a card (pt): empty, or filled with a check when chosen.
const MARK = 24;

/**
 * One choice as a card: a title, an optional line under it and an optional lead (an icon). Use
 * `radio` for one-of-many and `checkbox` for any-of-many; the group around the cards carries
 * `accessibilityRole="radiogroup"`. A `badge` ("Coming soon") explains a card that cannot be chosen.
 *
 * The card grows with its text; nothing in it has a fixed height.
 */
export function OptionCard({
  label,
  description,
  badge,
  leading,
  role,
  selected,
  disabled = false,
  compact = false,
  onPress,
}: {
  label: string;
  description?: string;
  badge?: string;
  leading?: ReactNode;
  role: 'radio' | 'checkbox';
  selected: boolean;
  disabled?: boolean;
  /** A tighter card for grids of short options: the mark sits in the corner, text below the lead. */
  compact?: boolean;
  onPress: () => void;
}) {
  const { color } = useTheme();
  const mark = (
    <View
      aria-hidden
      style={{ width: MARK, height: MARK }}
      className={`items-center justify-center rounded-pill border ${
        selected ? 'border-primary bg-primary' : 'border-field-border bg-bg'
      }`}
    >
      <Animated.View
        style={{
          opacity: selected ? 1 : 0,
          transform: [{ scale: selected ? 1 : motion.popFrom }],
          transitionProperty: ['opacity', 'transform'],
          transitionDuration: `${motion.fast}ms`,
          transitionTimingFunction: CSS_EASE_OUT,
        }}
      >
        <Icon name="check" color={color.onPrimary} size={size.iconSm} strokeWidth={3} />
      </Animated.View>
    </View>
  );
  const text = (
    <View className={compact ? 'gap-0.5' : 'flex-1 gap-0.5'}>
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Text variant="label" tone={selected ? 'primary' : 'fg'} className="shrink">
          {label}
        </Text>
        {badge ? (
          <View className="rounded-sm bg-surface px-1.5 py-1">
            <Text variant="badge" tone="muted">
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      {description ? (
        <Text variant="small" tone="muted">
          {description}
        </Text>
      ) : null}
    </View>
  );
  return (
    <PressScale
      accessibilityRole={role}
      accessibilityLabel={[label, description, badge].filter(Boolean).join(', ')}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={compact ? 'flex-1' : 'w-full'}
      style={compact ? { flex: 1 } : undefined}
    >
      <View
        className={`min-h-button rounded-card border p-3.5 ${
          selected ? 'border-primary bg-primary-soft' : 'border-border bg-bg'
        } ${disabled ? 'opacity-disabled' : ''} ${
          compact ? 'flex-1 gap-2.5' : 'flex-row items-center gap-3'
        }`}
      >
        {compact ? (
          <>
            <View className="flex-row items-start justify-between gap-2">
              {leading}
              {mark}
            </View>
            {text}
          </>
        ) : (
          <>
            {leading}
            {text}
            {mark}
          </>
        )}
      </View>
    </PressScale>
  );
}
