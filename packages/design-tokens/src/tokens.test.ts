import { describe, expect, it } from 'vitest';
import {
  avatar,
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
  ['primaryText', 'bg'],
  ['primaryText', 'surface'],
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

it('keeps the greeting bubble text readable', () => {
  expect(contrastRatio(brand.onBubble, brand.bubble)).toBeGreaterThanOrEqual(4.5);
});

describe('avatar palette', () => {
  it('shades every skin tone darker than its base, so shadows read as shadows', () => {
    for (const [name, tone] of Object.entries(avatar.skin)) {
      const lighter = contrastRatio(tone.base, '#000000');
      const darker = contrastRatio(tone.shade, '#000000');
      expect([name, darker < lighter]).toEqual([name, true]);
    }
  });

  it('keeps the eyes visible on every skin tone (dark iris on light skin, eye white on dark)', () => {
    for (const [name, tone] of Object.entries(avatar.skin)) {
      const visible = Math.max(
        contrastRatio(avatar.feature, tone.base),
        contrastRatio(avatar.eyeWhite, tone.base),
      );
      expect([name, visible >= 3]).toEqual([name, true]);
    }
  });
});
