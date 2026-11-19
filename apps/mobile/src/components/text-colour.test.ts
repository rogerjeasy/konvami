import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// `Text` adds its tone's colour class (the theme's ink by default). A colour set with a class of
// its own competes with it, and in dark mode the theme's light ink can win: such a `Text` must
// say `tone="inherit"`. (The Welcome greeting once drew light ink on its white bubble this way.)
const SRC = join(__dirname, '..');
const COLOUR_CLASS = /(?:^|\s)text-(?!center\b|left\b|right\b)[a-z]+(?:-[a-z]+)*(?=\s|$)/;
const TYPE_CLASS =
  /^text-(title|body|label|small|caption|heading|hero|stat|numeral|jumbo|lang|chat|overline|field|callout|emphasis|section|tile|display)/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : [];
  });
}

it('gives every Text coloured by a class tone="inherit"', () => {
  const offenders = sources(SRC).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return [...text.matchAll(/<Text\b([^>]*?)>/gs)]
      .filter(([, attrs = '']) => {
        const classes = /className=\{?["`]([^"`]*)["`]/.exec(attrs)?.[1] ?? '';
        const colours = classes
          .split(/\s+/)
          .filter((c) => COLOUR_CLASS.test(` ${c} `) && !TYPE_CLASS.test(c));
        return colours.length > 0 && !attrs.includes('tone=');
      })
      .map(
        (match) => `${file.slice(SRC.length + 1)}:${text.slice(0, match.index).split('\n').length}`,
      );
  });
  expect(offenders).toEqual([]);
});
