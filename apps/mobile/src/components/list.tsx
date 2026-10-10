import { Children, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/** Rows that belong together, as one bordered card with a line between them. */
export function ListGroup({ children }: { children: ReactNode }) {
  return (
    <View className="overflow-hidden rounded-card border border-border bg-chip">
      {Children.toArray(children).map((child, i) => (
        // The children are a fixed set of rows; their order never changes.
        <View key={i} className={i > 0 ? 'border-t border-border' : ''}>
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * One line of a settings list: an icon, what it is, a line about it or its current value, and
 * a chevron. The whole row is the button. It grows with its text; nothing in it is cut off.
 */
export function ListRow({
  icon,
  title,
  detail,
  value,
  tone = 'default',
  disabled = false,
  onPress,
}: {
  icon: IconName;
  title: string;
  /** A line under the title saying what is behind the row. */
  detail?: string;
  /** The current value, shown under the title in place of a detail. */
  value?: string;
  /** `danger` for a row that leads to deleting something. */
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onPress: () => void;
}) {
  const { color } = useTheme();
  const danger = tone === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail ?? value}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-button flex-row items-center gap-3 p-3.5 active:opacity-pressed ${disabled ? 'opacity-disabled' : ''}`}
    >
      <View
        aria-hidden
        style={{ width: size.avatarSm, height: size.avatarSm }}
        className={`items-center justify-center rounded-md ${danger ? 'bg-danger-soft' : 'bg-primary-soft'}`}
      >
        <Icon name={icon} color={danger ? color.danger : color.primaryText} size={size.iconMd} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="label" tone={danger ? 'danger' : 'fg'}>
          {title}
        </Text>
        {(value ?? detail) ? (
          <Text variant="small" tone="muted">
            {value ?? detail}
          </Text>
        ) : null}
      </View>
      <Icon name="chevronRight" color={color.fgSubtle} size={size.iconMd} />
    </Pressable>
  );
}
