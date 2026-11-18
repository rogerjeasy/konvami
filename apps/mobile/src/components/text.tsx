import { Text as RNText, type TextProps } from 'react-native';
import type { TypeToken } from '@konvami/design-tokens';

/**
 * Class names are spelled out in full (not built from strings) so Tailwind can find them.
 * Typed by the token keys, so adding a type style without a class fails to compile.
 */
const VARIANT: Record<TypeToken, string> = {
  title: 'font-display text-title',
  hero: 'font-display text-hero',
  tileTitle: 'font-display text-tile-title',
  section: 'font-display text-section',
  numeral: 'font-display text-numeral',
  jumbo: 'font-display text-jumbo',
  heading: 'font-display text-heading',
  stat: 'font-display text-stat',
  body: 'font-body text-body',
  button: 'font-body-bold text-button',
  label: 'font-body-bold text-label',
  labelSmall: 'font-body-bold text-label-small',
  chat: 'font-body-medium text-chat',
  emphasis: 'font-body-semibold text-emphasis',
  callout: 'font-body text-callout',
  small: 'font-body text-small',
  caption: 'font-body text-caption',
  captionStrong: 'font-body-bold text-caption-strong',
  overline: 'font-body-bold text-overline uppercase',
  micro: 'font-body text-micro',
  bodySmall: 'font-body text-body-small',
  labelMedium: 'font-body-bold text-label-medium',
  fieldLabel: 'font-body-bold text-field-label',
  code: 'font-display text-code',
  wheel: 'font-body-semibold text-wheel',
  wheelNear: 'font-body text-wheel-near',
  badge: 'font-body-extrabold text-badge uppercase',
  langBody: 'font-lang text-lang-body',
  langLine: 'font-lang text-lang-line',
  langLarge: 'font-lang text-lang-large',
  langWord: 'font-lang text-lang-word',
  langHero: 'font-lang text-lang-hero',
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
  onTomato: 'text-on-tomato',
  onForest: 'text-on-forest',
  onForestMuted: 'text-on-forest-muted',
  lime: 'text-lime',
  onLime: 'text-on-lime',
  onButter: 'text-on-butter',
  onPink: 'text-on-pink',
  onInverse: 'text-on-inverse',
  inverseAccent: 'text-inverse-accent',
  tomato: 'text-tomato',
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
