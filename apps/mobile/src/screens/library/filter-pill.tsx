import { View } from 'react-native';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';

/**
 * One filter of the library (v4): a soft pill that turns ink when chosen. One-of-many inside a
 * row that carries `accessibilityRole="radiogroup"`, like a choice chip.
 */
export function FilterPill({
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
        className={`min-h-tap min-w-tap items-center justify-center rounded-pill px-4 py-2 ${
          selected ? 'bg-inverse' : 'bg-surface'
        }`}
      >
        <Text variant="labelSmall" tone={selected ? 'onInverse' : 'fg'} className="text-center">
          {label}
        </Text>
      </View>
    </PressScale>
  );
}
