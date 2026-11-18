import type { ReactNode } from 'react';
import { ActivityIndicator, View, type PressableProps } from 'react-native';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';
import { useTileInk } from '@/components/tile';
import { useTheme, type ColorToken } from '@/theme';

const LOOK = {
  primary: { box: 'bg-primary border-primary', tone: 'onPrimary', spinner: 'onPrimary' },
  /** The soft alternative: a paper-grey pill with no outline. */
  secondary: { box: 'bg-secondary-bg border-secondary-bg', tone: 'fg', spinner: 'fg' },
  /** Talking: the tomato block's own action (and the "listening" state of a recorder). */
  tomato: { box: 'bg-tomato border-tomato', tone: 'onTomato', spinner: 'onTomato' },
  /** On a forest block, and a success ("Spot on!"). */
  lime: { box: 'bg-lime border-lime', tone: 'onLime', spinner: 'onLime' },
  /** The streak's colour (the "Hard" rating). */
  butter: { box: 'bg-butter border-butter', tone: 'onButter', spinner: 'onButter' },
  /** An outlined pill for the way back; on a colour block it takes the block's text colour. */
  ghost: { box: 'bg-transparent border-fg border-2', tone: 'fg', spinner: 'fg' },
  /** An action that deletes for good. Outlined, so it never outweighs a screen's way out. */
  danger: { box: 'bg-danger-soft border-danger-border', tone: 'danger', spinner: 'danger' },
  /** "Continue with Apple": black in light mode, white in dark. */
  apple: { box: 'bg-apple-bg border-apple-bg', tone: 'onApple', spinner: 'appleFg' },
} as const satisfies Record<string, { box: string; tone: string; spinner: ColorToken }>;

export type ButtonVariant = keyof typeof LOOK;

/**
 * Full-width pill button (56 pt, design token `size.buttonHeight`). `primary` is the one main
 * action on a screen; `secondary` the alternative; `danger` deletes. Shrinks slightly while pressed. Labels wrap
 * instead of overflowing at large text sizes, so the button grows in height rather than clipping.
 *
 * `loading` shows a spinner beside the label and blocks presses, so a request is never sent twice.
 */
export function Button({
  label,
  detail,
  variant = 'primary',
  leading,
  loading = false,
  disabled,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  /** A quieter line under the label (when a card would come back). */
  detail?: string;
  variant?: ButtonVariant;
  /** An icon or logo before the label. */
  leading?: ReactNode;
  loading?: boolean;
}) {
  const { color } = useTheme();
  const tile = useTileInk();
  const base = LOOK[variant];
  // An outline or a soft pill on a colour block is drawn in that block's own colours.
  const look =
    tile && variant === 'ghost'
      ? { box: 'bg-transparent border-2', tone: tile.tone, spinner: tile.ink }
      : tile && variant === 'secondary'
        ? { box: `${tile.veil} border-transparent`, tone: tile.tone, spinner: tile.ink }
        : base;
  const outline = tile && variant === 'ghost' ? { borderColor: color[tile.ink] } : undefined;
  const blocked = Boolean(disabled) || loading;
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      className="w-full"
      {...rest}
    >
      <View
        style={outline}
        className={`min-h-button w-full flex-row items-center justify-center gap-2.5 rounded-button border px-5 py-3 ${look.box} ${disabled ? 'opacity-disabled' : ''}`}
      >
        {loading ? <ActivityIndicator color={color[look.spinner]} /> : leading}
        <View className="shrink items-center">
          <Text variant="button" tone={look.tone} className="text-center">
            {label}
          </Text>
          {detail ? (
            <Text variant="caption" tone={look.tone} className="text-center">
              {detail}
            </Text>
          ) : null}
        </View>
      </View>
    </PressScale>
  );
}
