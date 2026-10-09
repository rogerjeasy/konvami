import { View, type PressableProps } from 'react-native';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';

/**
 * A quiet text-only action ("Skip", "Not now"). Keeps the 44 pt touch target however short the
 * label is. `primary` is for the alternative to a screen's main button.
 */
export function TextButton({
  label,
  tone = 'muted',
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & { label: string; tone?: 'muted' | 'primary' }) {
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={label} {...rest}>
      <View className="min-h-tap min-w-tap items-center justify-center px-3.5">
        <Text variant="label" tone={tone} className="text-center">
          {label}
        </Text>
      </View>
    </PressScale>
  );
}
