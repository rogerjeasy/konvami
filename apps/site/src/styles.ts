import {
  color,
  radius,
  size,
  space,
  type,
  type ColorToken,
  type TypeToken,
} from '@konvami/design-tokens';

/** The fonts the site serves itself (loading them from a font service would share readers'
 * addresses with it), as their files in @expo-google-fonts. */
export const FONTS = [
  {
    family: 'Inter',
    weight: 400,
    file: 'Inter_400Regular.ttf',
    from: '@expo-google-fonts/inter/400Regular',
  },
  {
    family: 'Inter',
    weight: 600,
    file: 'Inter_600SemiBold.ttf',
    from: '@expo-google-fonts/inter/600SemiBold',
  },
  {
    family: 'Lexend',
    weight: 600,
    file: 'Lexend_600SemiBold.ttf',
    from: '@expo-google-fonts/lexend/600SemiBold',
  },
] as const;

/** The colors the pages use, as CSS variables named after their tokens. */
const USED_COLORS = [
  'bg',
  'surface',
  'border',
  'fg',
  'fgMuted',
  'fgSubtle',
  'primary',
  'primaryText',
  'focus',
] as const satisfies readonly ColorToken[];

const px = (value: number) => `${value}px`;

function variables(scheme: 'light' | 'dark'): string {
  return USED_COLORS.map((token) => `--${token}: ${color[scheme][token]};`).join(' ');
}

function font(token: TypeToken): string {
  const t = type[token];
  const family = t.family === 'display' ? "'Lexend', sans-serif" : "'Inter', sans-serif";
  const weight = t.family === 'body' ? 400 : 600;
  const spacing = 'letterSpacing' in t ? ` letter-spacing: ${px(t.letterSpacing)};` : '';
  return `font-family: ${family}; font-weight: ${weight}; font-size: ${px(t.size)}; line-height: ${px(t.lineHeight)};${spacing}`;
}

/** The site's one stylesheet: the app's tokens, light and dark following the reader's setting. */
export function stylesheet(): string {
  const faces = FONTS.map(
    (f) =>
      `@font-face { font-family: '${f.family}'; font-weight: ${f.weight}; font-display: swap; src: url('fonts/${f.file}') format('truetype'); }`,
  ).join('\n');

  return `${faces}
:root { color-scheme: light dark; ${variables('light')} }
@media (prefers-color-scheme: dark) { :root { ${variables('dark')} } }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); ${font('body')} overflow-wrap: break-word; }
.masthead { max-width: ${px(size.contentMaxWidth + 2 * space.lg)}; margin: 0 auto; padding: ${px(space.lg)}; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: ${px(space.md)}; border-bottom: 1px solid var(--border); }
.brand { display: inline-flex; align-items: center; gap: ${px(space.sm)}; color: var(--fg); text-decoration: none; ${font('heading')} }
.mark { display: inline-flex; width: ${px(size.iconLg + space.sm)}; height: ${px(size.iconLg + space.sm)}; }
.mark svg { width: 100%; height: 100%; }
.languages { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0 ${px(space.xs)}; ${font('labelSmall')} }
.languages a, .languages span { display: inline-flex; align-items: center; min-height: ${px(size.minTapTarget)}; padding: 0 ${px(space.sm)}; border-radius: ${px(radius.md)}; }
.languages span { background: var(--surface); color: var(--fg); }
main { max-width: ${px(size.contentMaxWidth + 2 * space.lg)}; margin: 0 auto; padding: ${px(space['2xl'])} ${px(space.lg)} ${px(space['5xl'])}; }
h1, h2 { hyphens: auto; }
h1 { ${font('title')} margin: 0 0 ${px(space.sm)}; }
h1 + p { color: var(--fgSubtle); ${font('small')} margin-top: 0; }
h2 { ${font('heading')} margin: ${px(space['4xl'])} 0 ${px(space.sm)}; }
p, ul { margin: 0 0 ${px(space.lg)}; }
ul { padding-left: ${px(space.xl)}; }
li { margin-bottom: ${px(space.sm)}; }
strong { font-weight: 600; }
a { color: var(--primaryText); text-underline-offset: 2px; }
a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; box-shadow: 0 0 0 4px var(--focus); }
.index { list-style: none; padding: 0; }
.index li { padding: ${px(space.md)} 0; border-bottom: 1px solid var(--border); }
.index .language { display: block; color: var(--fgMuted); ${font('labelSmall')} }
.index a { display: inline-flex; align-items: center; min-height: ${px(size.minTapTarget)}; }
`;
}
