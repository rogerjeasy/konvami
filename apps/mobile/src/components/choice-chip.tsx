import { View } from 'react-native';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';

/**
 * One short option among a few ("B1", "telc Deutsch"), as a pill. For one-of-many inside a
 * wrapping row; the row carries `accessibilityRole="radiogroup"`. Use `OptionCard` when an
 * option needs a description.
 */
export function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <PressScale
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
    >
      <View
        className={`min-h-tap min-w-tap items-center justify-center rounded-pill border px-4 py-2 ${
          selected ? 'border-primary bg-primary-soft' : 'border-field-border bg-bg'
        }`}
      >
        <Text variant="labelSmall" tone={selected ? 'primary' : 'fg'} className="text-center">
          {label}
        </Text>
      </View>
    </PressScale>
  );
}
