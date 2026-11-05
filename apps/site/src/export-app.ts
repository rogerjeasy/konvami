/**
 * Writes the legal pages for the app, so the app shows the text the site publishes (6.18):
 *
 *   pnpm legal:generate
 *
 * Run it after changing content/ or site.config.ts, and commit the result.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../site.config.ts';
import { generatedSource } from './app-documents.ts';

const GENERATED_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'mobile',
  'src',
  'legal',
  'documents.generated.ts',
);

writeFileSync(GENERATED_FILE, generatedSource(config));
console.log(`Wrote ${GENERATED_FILE}`);
