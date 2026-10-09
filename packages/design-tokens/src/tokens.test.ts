import { describe, expect, it } from 'vitest';
import {
  brand,
  color,
  contrastRatio,
  cssVariables,
  tailwindColors,
  type ColorToken,
} from './index.ts';

// Text/background pairs that must reach WCAG AA (4.5:1) in both themes.
const TEXT_PAIRS: [ColorToken, ColorToken][] = [
  ['fg', 'bg'],
  ['fgMuted', 'bg'],
  ['fgSubtle', 'bg'],
  ['fg', 'surface'],
  ['fgMuted', 'surface'],
  ['fgSubtle', 'surface'],
  ['fg', 'chip'],
  ['fgSubtle', 'chip'],
  ['onPrimary', 'primary'],
  ['primaryText', 'primarySoft'],
  ['primaryText', 'chip'],
  ['warnText', 'warnSoft'],
  ['success', 'successSoft'],
  ['danger', 'dangerSoft'],
  ['fg', 'secondaryBg'],
  ['fg', 'field'],
  ['fgSubtle', 'field'],
  ['appleFg', 'appleBg'],
];

describe.each(['light', 'dark'] as const)('%s theme', (scheme) => {
  const p = color[scheme];

  it.each(TEXT_PAIRS)('%s on %s reaches 4.5:1', (fg, bg) => {
    expect(contrastRatio(p[fg], p[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('has the same keys as the light theme', () => {
    expect(Object.keys(p).sort()).toEqual(Object.keys(color.light).sort());
  });

  it('exposes every token as a CSS variable', () => {
    const vars = cssVariables(scheme);
    expect(vars['--color-primary-soft']).toBe(p.primarySoft);
    expect(Object.keys(vars)).toHaveLength(Object.keys(p).length);
  });
});

it('maps Tailwind color names to CSS variables', () => {
  expect(tailwindColors()['fg-muted']).toBe('var(--color-fg-muted)');
});

it('keeps the splash text readable on the light splash', () => {
  expect(contrastRatio(color.light.onSplash, color.light.splash)).toBeGreaterThanOrEqual(4.5);
});

it('keeps the avatar initial readable', () => {
  expect(contrastRatio(brand.onAvatar, brand.avatar)).toBeGreaterThanOrEqual(4.5);
});

it('keeps the setup guide initial readable', () => {
  expect(contrastRatio(brand.onGuide, brand.guide)).toBeGreaterThanOrEqual(4.5);
});

it('keeps the greeting bubble text readable', () => {
  expect(contrastRatio(brand.onBubble, brand.bubble)).toBeGreaterThanOrEqual(4.5);
});
