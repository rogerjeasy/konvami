import { Pressable, View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useTileInk } from '@/components/tile';
import { stepFeedback } from '@/lib/haptics';
import { useTheme } from '@/theme';

/**
 * One number chosen from a short list ("4 days", "40 min"), shown big, with a round − and + on
 * either side. Fits any phone where a row of seven chips would wrap. A screen reader hears one
 * adjustable control with its value, and can also press the two buttons. Inside a colour block
 * (`Tile`) it takes the block's ink and puts the number in lime on forest.
 */
export function Stepper<Value>({
  title,
  options,
  value,
  onChange,
  number,
  unit,
  label,
  lessLabel,
  moreLabel,
}: {
  title: string;
  options: readonly Value[];
  value: Value;
  onChange: (value: Value) => void;
  /** The big number for a value ("4"). */
  number: (value: Value) => string;
  /** The word under it ("days"), if the number needs one. */
  unit?: (value: Value) => string;
  /** The whole value in words ("4 days"), for a screen reader. */
  label: (value: Value) => string;
  lessLabel: string;
  moreLabel: string;
}) {
  const { color } = useTheme();
  const tile = useTileInk();
  const at = Math.max(0, options.indexOf(value));
  const go = (step: number) => {
    const next = options[at + step];
    if (next === undefined) return;
    stepFeedback();
    onChange(next);
  };
  const ink = tile ? color[tile.ink] : color.fg;
  const big = tile?.dark ? 'lime' : (tile?.tone ?? 'fg');
  const button = (step: -1 | 1) => {
    const disabled = options[at + step] === undefined;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={step < 0 ? lessLabel : moreLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => go(step)}
        style={{ width: size.minTapTarget, height: size.minTapTarget }}
        className={`items-center justify-center rounded-pill active:opacity-pressed ${
          tile ? tile.veil : 'bg-surface'
        } ${disabled ? 'opacity-disabled' : ''}`}
      >
        <Icon name={step < 0 ? 'minus' : 'plus'} color={ink} size={size.iconMd} strokeWidth={2.4} />
      </Pressable>
    );
  };
  return (
    <View className="flex-1 gap-2">
      <Text variant="overline" tone={tile?.tone ?? 'subtle'}>
        {title}
      </Text>
      <View className="flex-row items-center justify-between gap-2">
        {button(-1)}
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={title}
          accessibilityValue={{ text: label(value) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={({ nativeEvent }) =>
            go(nativeEvent.actionName === 'increment' ? 1 : -1)
          }
          className="shrink items-center"
        >
          <Text variant="stat" tone={big}>
            {number(value)}
          </Text>
          {unit ? (
            <Text variant="labelSmall" tone={tile?.tone ?? 'muted'}>
              {unit(value)}
            </Text>
          ) : null}
        </View>
        {button(1)}
      </View>
    </View>
  );
}
