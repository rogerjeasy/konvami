import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { motion } from '@konvami/design-tokens';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';
import { stepFeedback } from '@/lib/haptics';
import { CSS_EASE_OUT } from '@/lib/motion';
import { useTheme } from '@/theme';

const STEPS = [1, 2, 3, 4, 5] as const;
export type ScaleStep = (typeof STEPS)[number];

// The round mark of the chosen position (pt), inside a 44 pt touch target. The other marks are
// the same circle drawn smaller, so choosing one only scales it (no layout change).
const MARK = 26;
const SMALL_MARK_SCALE = 0.5;
// The line the marks sit on.
const TRACK_HEIGHT = 2;

/**
 * A five-point scale between two named ends ("Reserved … Warm"). The ends are written out
 * above the marks, so the scale reads the same at any width and text size; each mark is a
 * radio button of its own.
 */
export function Scale({
  label,
  low,
  high,
  value,
  onChange,
}: {
  /** What the scale measures ("Warmth"). */
  label: string;
  low: string;
  high: string;
  value: number;
  onChange: (value: ScaleStep) => void;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  return (
    <View className="gap-1">
      <View aria-hidden className="flex-row items-baseline justify-between gap-3">
        <Text variant="small" tone={value < 3 ? 'primary' : 'muted'} className="shrink">
          {low}
        </Text>
        <Text variant="fieldLabel" className="shrink text-center">
          {label}
        </Text>
        <Text variant="small" tone={value > 3 ? 'primary' : 'muted'} className="shrink text-right">
          {high}
        </Text>
      </View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('partners.studio.personality.scale', { trait: label, low, high })}
        className="flex-row items-center justify-between"
      >
        <View
          aria-hidden
          style={{ height: TRACK_HEIGHT, pointerEvents: 'none' }}
          className="absolute inset-x-5 rounded-pill bg-track"
        />
        {STEPS.map((step) => {
          const chosen = step === value;
          return (
            <PressScale
              key={step}
              accessibilityRole="radio"
              accessibilityLabel={t('partners.studio.personality.step', { position: step })}
              accessibilityState={{ checked: chosen }}
              onPress={() => {
                stepFeedback();
                onChange(step);
              }}
            >
              <View className="min-h-tap min-w-tap items-center justify-center">
                {/* Colors are set as styles: class names do not reach an animated view. */}
                <Animated.View
                  style={{
                    width: MARK,
                    height: MARK,
                    borderRadius: MARK / 2,
                    borderWidth: 2,
                    borderColor: chosen ? color.primary : color.fieldBorder,
                    backgroundColor: chosen ? color.primary : color.bg,
                    transform: [{ scale: chosen ? 1 : SMALL_MARK_SCALE }],
                    transitionProperty: ['transform', 'backgroundColor', 'borderColor'],
                    transitionDuration: `${motion.fast}ms`,
                    transitionTimingFunction: CSS_EASE_OUT,
                  }}
                />
              </View>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}
