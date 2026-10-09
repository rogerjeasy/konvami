import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/** The round bordered button in a screen header (back, close). */
export function HeaderButton({
  icon,
  label,
  onPress,
}: {
  icon: 'chevronLeft' | 'close';
  label: string;
  onPress: () => void;
}) {
  const { color } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: size.headerButton, height: size.headerButton }}
      className="items-center justify-center rounded-pill border border-border bg-bg active:opacity-pressed"
    >
      <Icon name={icon} color={color.fg} size={size.iconMd} strokeWidth={2.2} />
    </Pressable>
  );
}

/**
 * Header of a multi-step flow: back button, one progress segment per step, and "2 of 4". Screen
 * readers hear the segments and the counter once, as "Step 2 of 4".
 */
export function StepHeader({
  step,
  total,
  onBack,
}: {
  /** The current step, starting at 1. */
  step: number;
  total: number;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="min-h-tap flex-row items-center gap-3.5">
      <HeaderButton icon="chevronLeft" label={t('common.back')} onPress={onBack} />
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('common.stepOf', { current: step, total })}
        accessibilityValue={{ min: 0, max: total, now: step }}
        className="flex-1 flex-row items-center gap-3.5"
      >
        <View className="flex-1 flex-row gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <View
              key={i}
              style={{ height: size.progressHeight }}
              className={`flex-1 rounded-sm ${i < step ? 'bg-primary' : 'bg-track'}`}
            />
          ))}
        </View>
        <Text variant="fieldLabel" tone="subtle">
          {t('common.stepCounter', { current: step, total })}
        </Text>
      </View>
    </View>
  );
}
