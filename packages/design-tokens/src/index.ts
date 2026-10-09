import { color, type ColorScheme, type ColorToken, type Palette } from './tokens.ts';

export * from './tokens.ts';
export { contrastRatio } from './contrast.ts';
export * from './logo.ts';

/** The resolved palette for a color scheme. */
export function palette(scheme: ColorScheme): Palette {
  return color[scheme];
}

/** `primarySoft` → `primary-soft`: the name a token has in CSS and in Tailwind classes. */
export function kebab(token: string): string {
  return token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** CSS custom property that holds a color token, e.g. `--color-primary-soft`. */
export function cssVar(token: ColorToken): string {
  return `--color-${kebab(token)}`;
}

/** Every color token as a CSS custom property for one scheme (fed to NativeWind's `vars()`). */
export function cssVariables(scheme: ColorScheme): Record<string, string> {
  const p = palette(scheme);
  return Object.fromEntries(
    (Object.keys(p) as ColorToken[]).map((token) => [cssVar(token), p[token]]),
  );
}

/** Tailwind `theme.colors`: each token points at its CSS variable, so one class works in both themes. */
export function tailwindColors(): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(color.light) as ColorToken[]).map((token) => [
      kebab(token),
      `var(${cssVar(token)})`,
    ]),
  );
}
