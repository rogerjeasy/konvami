import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

export interface ProgressChip {
  key: string;
  label: string;
  done: boolean;
  /** What a screen reader says for the chip ("Goals: saved"). */
  accessibilityLabel: string;
}

/**
 * The parts of something that happens step by step (the questions of the spoken setup, the
 * tasks of the placement test), each ticked off when it is done. The row wraps on narrow windows.
 */
export function ProgressChips({ items }: { items: readonly ProgressChip[] }) {
  const { color } = useTheme();
  return (
    <View className="flex-row flex-wrap justify-center gap-2 pt-1">
      {items.map((item) => (
        <View
          key={item.key}
          accessible
          accessibilityLabel={item.accessibilityLabel}
          className={`flex-row items-center gap-1.5 rounded-pill px-2.5 py-1.5 ${
            item.done ? 'bg-success-soft' : 'bg-surface'
          }`}
        >
          {item.done ? (
            <Icon name="check" color={color.success} size={size.iconSm} strokeWidth={3} />
          ) : null}
          <Text variant="captionStrong" tone={item.done ? 'success' : 'subtle'}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
