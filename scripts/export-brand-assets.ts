/**
 * Renders the Konvami v2 logo (packages/design-tokens/src/logo.ts) to every PNG the Expo app needs,
 * plus SVG masters for designers. Re-run after any change to the logo or brand colors:
 *
 *   pnpm brand:export
 *
 * Outputs are committed: apps/mobile/assets/brand/*.png and design/brand/konvami/svg-v2/*.svg.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { brand, markSvg, monoMarkSvg, solidSvg } from '../packages/design-tokens/src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appAssets = join(root, 'apps/mobile/assets/brand');
const svgMasters = join(root, 'design/brand/konvami/svg-v2');

// Android adaptive icons are cropped to the centre 66% (safe zone); keep the mark inside it.
const ADAPTIVE_SCALE = 0.66;

const png: { file: string; svg: string; size: number }[] = [
  { file: 'icon.png', svg: markSvg({ tile: 'square' }), size: 1024 },
  { file: 'splash-icon.png', svg: markSvg(), size: 1024 },
  {
    file: 'android-icon-foreground.png',
    svg: markSvg({ scale: ADAPTIVE_SCALE }),
    size: 1024,
  },
  { file: 'android-icon-background.png', svg: solidSvg(brand.tile), size: 1024 },
  {
    file: 'android-icon-monochrome.png',
    svg: monoMarkSvg({ scale: ADAPTIVE_SCALE }),
    size: 1024,
  },
  { file: 'favicon.png', svg: markSvg({ tile: 'rounded' }), size: 48 },
  // Android draws a notification's small icon from its alpha only: the white mark, 96 px.
  { file: 'notification-icon.png', svg: monoMarkSvg(), size: 96 },
];

const svg: { file: string; svg: string }[] = [
  { file: 'konvami-icon-square.svg', svg: markSvg({ tile: 'square' }) },
  { file: 'konvami-icon-rounded.svg', svg: markSvg({ tile: 'rounded' }) },
  { file: 'konvami-mark.svg', svg: markSvg() },
  { file: 'konvami-mark-mono-white.svg', svg: monoMarkSvg() },
];

mkdirSync(appAssets, { recursive: true });
mkdirSync(svgMasters, { recursive: true });

for (const { file, svg: source, size } of png) {
  const image = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render();
  writeFileSync(join(appAssets, file), image.asPng());
  console.log(`apps/mobile/assets/brand/${file} (${size}px)`);
}

for (const { file, svg: source } of svg) {
  writeFileSync(join(svgMasters, file), `${source}\n`);
  console.log(`design/brand/konvami/svg-v2/${file}`);
}
