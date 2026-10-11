import { Pressable, View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/**
 * Something the user put on a list, in their own words, with the button that takes it off
 * again. The text wraps inside the chip; the button keeps its 44 pt touch target.
 */
export function RemovableChip({
  label,
  removeLabel,
  disabled = false,
  onRemove,
}: {
  label: string;
  /** What the button does, for screen readers ("Remove “politics”"). */
  removeLabel: string;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const { color } = useTheme();
  return (
    <View className="max-w-full flex-row items-center rounded-pill border border-border bg-chip pl-3.5">
      <Text variant="labelSmall" className="shrink py-2">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onRemove}
        className={`min-h-tap min-w-tap items-center justify-center active:opacity-pressed ${disabled ? 'opacity-disabled' : ''}`}
      >
        <Icon name="close" color={color.fgMuted} size={size.iconSm} />
      </Pressable>
    </View>
  );
}
