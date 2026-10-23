/**
 * Builds the site into dist/, which infra/modules/site publishes:
 *
 *   pnpm --filter @konvami/site build
 *
 * Stops, writing nothing, while a setting in site.config.ts is empty.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../site.config.ts';
import { missingSettings } from './pages.ts';
import { buildSite } from './site.ts';

const missing = missingSettings(config);
if (missing.length > 0) {
  console.error(`Fill in ${missing.join(', ')} in apps/site/site.config.ts before building.`);
  process.exit(1);
}

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const written = buildSite(config, dist);
console.log(`Built ${written.length} files into ${dist}`);
