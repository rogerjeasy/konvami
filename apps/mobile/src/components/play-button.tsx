import { ActivityIndicator, Pressable } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { useTheme } from '@/theme';

export type PlayState = 'idle' | 'loading' | 'playing';

/**
 * The round button that plays or stops one clip (a voice's sample, a turn of a recording).
 * `label` names what it does now: play while idle, stop while playing.
 */
export function PlayButton({
  label,
  state,
  onPress,
}: {
  label: string;
  state: PlayState;
  onPress: () => void;
}) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: state === 'loading' }}
      disabled={state === 'loading'}
      onPress={onPress}
      style={{ width: size.headerButton, height: size.headerButton }}
      className={`items-center justify-center rounded-pill border active:opacity-pressed ${
        state === 'playing' ? 'border-primary bg-primary-soft' : 'border-border bg-chip'
      }`}
    >
      {state === 'loading' ? (
        <ActivityIndicator color={color.primary} />
      ) : (
        <Icon
          name={state === 'playing' ? 'stop' : 'play'}
          color={state === 'playing' ? color.primaryText : color.fg}
          size={size.iconMd}
        />
      )}
    </Pressable>
  );
}
