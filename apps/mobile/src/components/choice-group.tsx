import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';

/**
 * A named choice among a few short options (chips or color swatches), as a group of radio
 * buttons that wraps on narrow windows. Swatches bring their own touch area; `chips` need room
 * between them.
 */
export function ChoiceGroup({
  label,
  chips = false,
  children,
}: {
  label: string;
  chips?: boolean;
  children: ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text variant="fieldLabel" aria-hidden>
        {label}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className={`flex-row flex-wrap ${chips ? 'gap-2 py-1' : 'gap-1'}`}
      >
        {children}
      </View>
    </View>
  );
}

/** A named on/off choice: its name on the left, the switch on the right. */
export function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View className="min-h-tap flex-row items-center justify-between gap-3">
      <Text variant="label" aria-hidden className="flex-1">
        {label}
      </Text>
      <Switch label={label} value={value} onValueChange={onChange} />
    </View>
  );
}
