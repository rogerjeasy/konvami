import type { ReactNode } from 'react';
import { ActivityIndicator, View, type PressableProps } from 'react-native';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';
import { useTheme, type ColorToken } from '@/theme';

const LOOK = {
  primary: { box: 'bg-primary border-primary', tone: 'onPrimary', spinner: 'onPrimary' },
  secondary: { box: 'bg-secondary-bg border-field-border', tone: 'fg', spinner: 'fg' },
  /** An action that deletes for good. Outlined, so it never outweighs a screen's way out. */
  danger: { box: 'bg-danger-soft border-danger-border', tone: 'danger', spinner: 'danger' },
  /** "Continue with Apple": black in light mode, white in dark. */
  apple: { box: 'bg-apple-bg border-apple-bg', tone: 'onApple', spinner: 'appleFg' },
} as const satisfies Record<string, { box: string; tone: string; spinner: ColorToken }>;

export type ButtonVariant = keyof typeof LOOK;

/**
 * Full-width action button (54 pt, design token `size.buttonHeight`). `primary` is the one main
 * action on a screen; `secondary` the alternative; `danger` deletes. Shrinks slightly while pressed. Labels wrap
 * instead of overflowing at large text sizes, so the button grows in height rather than clipping.
 *
 * `loading` shows a spinner beside the label and blocks presses, so a request is never sent twice.
 */
export function Button({
  label,
  variant = 'primary',
  leading,
  loading = false,
  disabled,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  /** An icon or logo before the label. */
  leading?: ReactNode;
  loading?: boolean;
}) {
  const { color } = useTheme();
  const look = LOOK[variant];
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
        className={`min-h-button w-full flex-row items-center justify-center gap-2.5 rounded-button border px-5 py-3 ${look.box} ${disabled ? 'opacity-disabled' : ''}`}
      >
        {loading ? <ActivityIndicator color={color[look.spinner]} /> : leading}
        <Text variant="button" tone={look.tone} className="shrink text-center">
          {label}
        </Text>
      </View>
    </PressScale>
  );
}
