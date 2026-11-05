import { Pressable } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { useTheme } from '@/theme';

/**
 * The round button that reports one line of a conversation (spec §16.1). `label` says what it
 * does: "Report this line", or "Reported" once the learner did (it can still be pressed, to
 * change the reason).
 */
export function FlagButton({
  label,
  flagged,
  onPress,
}: {
  label: string;
  flagged: boolean;
  onPress: () => void;
}) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: flagged }}
      onPress={onPress}
      style={{ width: size.headerButton, height: size.headerButton }}
      className={`items-center justify-center rounded-pill border active:opacity-pressed ${
        flagged ? 'border-primary bg-primary-soft' : 'border-border bg-chip'
      }`}
    >
      <Icon name="flag" color={flagged ? color.primaryText : color.fgMuted} size={size.iconMd} />
    </Pressable>
  );
}
