import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markSvg } from '@konvami/design-tokens';
import {
  LANGUAGES,
  PAGES,
  fillPlaceholders,
  pagePath,
  renderIndex,
  renderPage,
  titleOf,
  type Language,
  type Page,
  type Settings,
} from './pages.ts';
import { FONTS, stylesheet } from './styles.ts';

const content = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');
const require = createRequire(import.meta.url);

/** Writes the whole site into `out` (emptied first): every page in every language, the front
 * page, the stylesheet, the icon and the fonts. Returns the paths written, relative to `out`. */
export function buildSite(settings: Settings, out: string): string[] {
  rmSync(out, { recursive: true, force: true });
  const written: string[] = [];

  function write(path: string, contents: string | Buffer): void {
    const file = join(out, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
    written.push(path);
  }

  const titles = {} as Record<Language, Record<Page, string>>;
  for (const lang of LANGUAGES) {
    titles[lang] = {} as Record<Page, string>;
    for (const page of PAGES) {
      const markdown = readFileSync(join(content, page, `${lang}.md`), 'utf8');
      titles[lang][page] = titleOf(fillPlaceholders(markdown, settings, lang));
      write(pagePath(lang, page), renderPage({ lang, page, markdown, settings }));
    }
  }

  write('index.html', renderIndex(titles));
  write('styles.css', stylesheet());
  write('favicon.svg', markSvg({ tile: 'rounded' }));
  for (const font of FONTS) {
    const folder = dirname(require.resolve(`${font.from}/index.js`));
    write(`fonts/${font.file}`, readFileSync(join(folder, font.file)));
  }
  return written;
}
