import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGES as APP_LANGUAGES } from '../../mobile/src/i18n/languages.ts';
import { config } from '../site.config.ts';
import {
  fillPlaceholders,
  missingSettings,
  pagePath,
  renderPage,
  LANGUAGES,
  PAGES,
} from './pages.ts';

const complete = {
  controller: {
    name: 'Ada Example',
    address: 'Street 1, 8000 Zürich, Switzerland',
    email: 'privacy@example.org',
  },
  updated: '2026-10-23',
};

function content(lang: string, page: string): string {
  return readFileSync(new URL(`../content/${page}/${lang}.md`, import.meta.url), 'utf8');
}

describe('fillPlaceholders', () => {
  it('puts the settings into the text', () => {
    expect(fillPlaceholders('Write to {{controller.email}}.', complete, 'en')).toBe(
      'Write to privacy@example.org.',
    );
  });

  it('writes the date in the page language', () => {
    expect(fillPlaceholders('{{updated}}', complete, 'de')).toBe('23. Oktober 2026');
    expect(fillPlaceholders('{{updated}}', complete, 'en')).toBe('October 23, 2026');
  });

  it('refuses a placeholder it does not know, so a typo never reaches the page', () => {
    expect(() => fillPlaceholders('{{controller.phone}}', complete, 'en')).toThrow(
      /controller\.phone/,
    );
  });
});

describe('missingSettings', () => {
  it('names every empty setting', () => {
    const empty = { controller: { name: '', address: ' ', email: 'a@b.c' }, updated: '2026-10-23' };
    expect(missingSettings(empty)).toEqual(['controller.name', 'controller.address']);
  });

  it('is empty when everything is filled in', () => {
    expect(missingSettings(complete)).toEqual([]);
  });
});

describe('renderPage', () => {
  const html = renderPage({
    lang: 'fr',
    page: 'privacy',
    markdown: '# Titre\n\nTexte.',
    settings: complete,
  });

  it('is a page in its own language, titled by its first heading', () => {
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<title>Titre · Konvami</title>');
    expect(html).toContain('<h1>Titre</h1>');
  });

  it('links to the same page in every other language', () => {
    for (const lang of LANGUAGES) {
      if (lang === 'fr') expect(html).toContain('aria-current="page"');
      else expect(html).toContain(`href="../${lang}/privacy.html"`);
    }
  });

  it('refuses raw HTML in the content', () => {
    expect(() =>
      renderPage({
        lang: 'en',
        page: 'privacy',
        markdown: '# T\n\n<script>x</script>',
        settings: complete,
      }),
    ).toThrow(/HTML/);
  });
});

describe('the pages', () => {
  it('are in the same languages as the app', () => {
    expect([...LANGUAGES]).toEqual([...APP_LANGUAGES]);
  });

  it('are at the address the app opens', () => {
    expect(pagePath('de', 'privacy')).toBe('de/privacy.html');
  });

  for (const page of PAGES) {
    it(`${page}: every language has the same sections, in the same order`, () => {
      const outline = (lang: string) =>
        content(lang, page)
          .split('\n')
          .filter((line) => line.startsWith('#'))
          .map((line) => line.match(/^#+/)?.[0]);
      const english = outline('en');
      for (const lang of LANGUAGES) expect(outline(lang)).toEqual(english);
    });

    it(`${page}: every language renders with the settings`, () => {
      for (const lang of LANGUAGES) {
        expect(() =>
          renderPage({ lang, page, markdown: content(lang, page), settings: complete }),
        ).not.toThrow();
      }
    });
  }

  it('settings have a valid date', () => {
    expect(config.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
