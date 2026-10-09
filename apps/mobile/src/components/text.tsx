import { Text as RNText, type TextProps } from 'react-native';
import type { TypeToken } from '@konvami/design-tokens';

/**
 * Class names are spelled out in full (not built from strings) so Tailwind can find them.
 * Typed by the token keys, so adding a type style without a class fails to compile.
 */
const VARIANT: Record<TypeToken, string> = {
  title: 'font-display text-title',
  heading: 'font-display text-heading',
  stat: 'font-display text-stat',
  body: 'font-body text-body',
  button: 'font-body-semibold text-button',
  label: 'font-body-semibold text-label',
  labelSmall: 'font-body-semibold text-label-small',
  chat: 'font-body-medium text-chat',
  emphasis: 'font-body-semibold text-emphasis',
  callout: 'font-body text-callout',
  small: 'font-body text-small',
  caption: 'font-body text-caption',
  captionStrong: 'font-body-semibold text-caption-strong',
  overline: 'font-body-semibold text-overline uppercase',
  micro: 'font-body text-micro',
  bodySmall: 'font-body text-body-small',
  labelMedium: 'font-body-semibold text-label-medium',
  fieldLabel: 'font-body-semibold text-field-label',
  code: 'font-display text-code',
  wheel: 'font-body-semibold text-wheel',
  wheelNear: 'font-body text-wheel-near',
  badge: 'font-body-bold text-badge uppercase',
};

const TONE = {
  fg: 'text-fg',
  muted: 'text-fg-muted',
  subtle: 'text-fg-subtle',
  primary: 'text-primary-text',
  onPrimary: 'text-on-primary',
  onApple: 'text-apple-fg',
  success: 'text-success',
  warn: 'text-warn-text',
  danger: 'text-danger',
  dangerTitle: 'text-danger-title',
  onSplash: 'text-on-splash',
  onSplashMuted: 'text-on-splash-muted',
  inherit: '',
} as const;

export type TextTone = keyof typeof TONE;

export type AppTextProps = TextProps & {
  variant?: TypeToken;
  tone?: TextTone;
  className?: string;
};

/**
 * The only text component in the app. It always follows the OS text size: never pass
 * allowFontScaling={false}. Decorative text inside illustrations may cap growth with
 * maxFontSizeMultiplier (see ILLUSTRATION_MAX_FONT_SCALE).
 */
export function Text({ variant = 'body', tone = 'fg', className, ...rest }: AppTextProps) {
  return (
    <RNText
      {...rest}
      className={[VARIANT[variant], TONE[tone], className].filter(Boolean).join(' ')}
    />
  );
}
