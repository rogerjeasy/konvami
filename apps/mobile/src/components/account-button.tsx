import { Pressable } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/**
 * The round button in a screen's header that leads to the account: the learner's initial, or a
 * person when the account has no name.
 */
export function AccountButton({
  name,
  label,
  onPress,
}: {
  /** The learner's first name; may be empty. */
  name: string;
  label: string;
  onPress: () => void;
}) {
  const { color } = useTheme();
  const initial = name.trim().charAt(0).toLocaleUpperCase();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: size.headerButton, height: size.headerButton }}
      className="items-center justify-center rounded-pill border border-border bg-surface active:opacity-pressed"
    >
      {initial ? (
        <Text variant="label" aria-hidden>
          {initial}
        </Text>
      ) : (
        <Icon name="user" color={color.fg} size={size.iconMd} />
      )}
    </Pressable>
  );
}
