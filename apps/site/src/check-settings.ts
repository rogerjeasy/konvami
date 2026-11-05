/**
 * Fails while the controller's details are empty in site.config.ts:
 *
 *   pnpm legal:check
 *
 * Run it before a store build. The legal pages in the app (6.18) carry a draft notice while a
 * detail is missing, and the site refuses to build, so neither can be published by accident.
 */
import { config } from '../site.config.ts';
import { missingSettings } from './pages.ts';

const missing = missingSettings(config);
if (missing.length > 0) {
  console.error(
    `Fill in ${missing.join(', ')} in apps/site/site.config.ts, then run pnpm legal:generate.`,
  );
  process.exit(1);
}
console.log('The legal details are filled in.');
