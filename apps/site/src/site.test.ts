import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LANGUAGES, pagePath } from './pages.ts';
import { buildSite } from './site.ts';

const out = mkdtempSync(join(tmpdir(), 'konvami-site-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

const settings = {
  controller: {
    name: 'Ada Example',
    address: 'Street 1, 8000 Zürich',
    email: 'privacy@example.org',
  },
  updated: '2026-10-23',
};

describe('buildSite', () => {
  const written = buildSite(settings, out);

  it('writes the privacy policy in every language, with the settings filled in', () => {
    for (const lang of LANGUAGES) {
      const html = readFileSync(join(out, pagePath(lang, 'privacy')), 'utf8');
      expect(html).toContain('Ada Example');
      expect(html).toContain('privacy@example.org');
      expect(html).not.toContain('{{');
    }
  });

  it('serves everything the pages load from itself', () => {
    expect(written).toEqual(
      expect.arrayContaining([
        'index.html',
        'styles.css',
        'favicon.svg',
        'fonts/Inter_400Regular.ttf',
        'fonts/Inter_600SemiBold.ttf',
        'fonts/Lexend_600SemiBold.ttf',
      ]),
    );
    const css = readFileSync(join(out, 'styles.css'), 'utf8');
    expect(css).not.toMatch(/https?:/);
    expect(css).not.toContain('undefined');
  });

  it('links the front page to every page', () => {
    const index = readFileSync(join(out, 'index.html'), 'utf8');
    for (const lang of LANGUAGES) expect(index).toContain(`href="${pagePath(lang, 'privacy')}"`);
  });
});
