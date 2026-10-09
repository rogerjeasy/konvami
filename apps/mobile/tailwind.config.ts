import type { Config } from 'tailwindcss';
import {
  brand,
  fontFamily,
  languageAccent,
  kebab,
  opacity,
  radius,
  size,
  tailwindColors,
  type as typeScale,
} from '@konvami/design-tokens';

/**
 * Tailwind theme generated from @konvami/design-tokens. Colors, fonts, type sizes and radii
 * REPLACE Tailwind's defaults, so only design-system values exist as classes (`bg-primary`,
 * `text-fg-muted`, `font-display`, `text-body`, `rounded-button`). Spacing keeps Tailwind's 4-pt scale.
 * Colors are CSS variables set per theme in src/theme/ThemeProvider.tsx, so one class works in
 * light and dark mode.
 */
const px = (n: number) => `${n}px`;
/** Maps an object's values, renaming camelCase token keys to kebab-case class names. */
const mapTokens = <T, R>(obj: Record<string, T>, fn: (v: T) => R) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [kebab(k), fn(v)]));

const config: Config = {
  // Themes switch through CSS variables (ThemeProvider), not `dark:` classes. 'class' lets NativeWind
  // accept a manually set color scheme on web.
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    colors: {
      transparent: 'transparent',
      ...tailwindColors(),
      // Fixed brand colors: the same in both themes (logo tile, persona avatars, language accents).
      brand: mapTokens(brand, String),
      lang: { ...languageAccent },
    },
    fontFamily: mapTokens(fontFamily, (f) => [f]),
    fontSize: mapTokens(typeScale, (t) => [
      px(t.size),
      {
        lineHeight: px(t.lineHeight),
        ...('letterSpacing' in t ? { letterSpacing: px(t.letterSpacing) } : {}),
      },
    ]),
    borderRadius: { none: '0px', ...mapTokens(radius, px) },
    extend: {
      opacity: mapTokens(opacity, String),
      height: { button: px(size.buttonHeight), field: px(size.fieldHeight), dot: px(size.pageDot) },
      width: { dot: px(size.pageDot), 'dot-active': px(size.pageDotActive) },
      minHeight: {
        tap: px(size.minTapTarget),
        button: px(size.buttonHeight),
        field: px(size.fieldHeight),
      },
      minWidth: { tap: px(size.minTapTarget) },
      maxWidth: {
        content: px(size.contentMaxWidth),
        screen: px(size.screenMaxWidth),
        illustration: px(size.illustrationMaxWidth),
      },
    },
  },
  plugins: [],
};

export default config;
