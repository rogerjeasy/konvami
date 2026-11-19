import { Pressable } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon, type IconName } from '@/components/icon';
import { useTheme } from '@/theme';

/**
 * The round bordered button with one icon that sits beside a line or a card (report a line, more
 * for a line). `selected` shows it on: the primary soft ground and the primary ink.
 */
export function IconButton({
  icon,
  label,
  selected = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ width: size.headerButton, height: size.headerButton }}
      className={`items-center justify-center rounded-pill border active:opacity-pressed ${
        selected ? 'border-primary bg-primary-soft' : 'border-border bg-chip'
      }`}
    >
      <Icon name={icon} color={selected ? color.primaryText : color.fgMuted} size={size.iconMd} />
    </Pressable>
  );
}
