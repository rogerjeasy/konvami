import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { config } from '../site.config.ts';
import { generatedSource, parseDocument, readDocuments } from './app-documents.ts';
import { LANGUAGES, PAGES } from './pages.ts';

const generated = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'mobile',
  'src',
  'legal',
  'documents.generated.ts',
);

describe('parseDocument', () => {
  it('takes the first heading as the title and keeps bold, lists and sections', () => {
    const document = parseDocument(
      [
        '# Title',
        '',
        'Plain **bold** and [a link](x.html) text.',
        '',
        '## Section',
        '',
        '- one',
        '- **two** items',
      ].join('\n'),
    );

    expect(document).toEqual({
      title: 'Title',
      blocks: [
        {
          kind: 'paragraph',
          spans: [{ text: 'Plain ' }, { text: 'bold', bold: true }, { text: ' and a link text.' }],
        },
        { kind: 'heading', text: 'Section' },
        {
          kind: 'list',
          items: [[{ text: 'one' }], [{ text: 'two', bold: true }, { text: ' items' }]],
        },
      ],
    });
  });

  it('refuses Markdown the app cannot draw, so nothing is silently dropped', () => {
    expect(() => parseDocument('# T\n\n> quote')).toThrow(/Unsupported/);
    expect(() => parseDocument('# T\n\n### deep')).toThrow(/Unsupported heading/);
  });
});

describe('the legal pages for the app', () => {
  it('cover every page in every language', () => {
    const documents = readDocuments();
    for (const lang of LANGUAGES) {
      for (const page of PAGES) expect(documents[lang][page].blocks.length).toBeGreaterThan(5);
    }
  });

  it('are the committed file: run pnpm legal:generate after changing content or settings', () => {
    expect(readFileSync(generated, 'utf8')).toBe(generatedSource(config));
  });
});
