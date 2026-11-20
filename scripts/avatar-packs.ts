/**
 * Turns the artist's avatar art packs into code the app can bundle (spec §6.20; the brief is
 * design/avatar-art/BRIEF.md). Re-run after adding or changing a pack:
 *
 *   pnpm avatar:packs
 *
 * Reads design/avatar-art/packs/<id>/: a pack.json ({ "name": "..." }) and one file per layer,
 * named by its key (face.oval.svg, mouth.open.png, irises.blue.png). SVG text is inlined; PNGs are
 * copied to apps/mobile/assets/avatar-packs/<id>/ so Metro can bundle them. Writes
 * apps/mobile/src/components/avatar/packs.generated.ts. The app's tests then check every key
 * against the brief (`art-pack.test.ts`) and that the pack covers every look it is asked to draw.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packsDir = join(root, 'design/avatar-art/packs');
const assetsDir = join(root, 'apps/mobile/assets/avatar-packs');
const output = join(root, 'apps/mobile/src/components/avatar/packs.generated.ts');

// A pack id and a layer key: lower-case words joined by dashes, keys in dot-separated parts.
const PACK_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LAYER_KEY = /^[a-z]+(-[a-z]+)*(\.[a-z]+)*$/;
// The drawn portrait and the sample are the app's own.
const RESERVED = new Set(['konvami-drawn', 'konvami-sample']);

const fail = (message: string): never => {
  console.error(`avatar:packs: ${message}`);
  process.exit(1);
};

const ids = existsSync(packsDir)
  ? readdirSync(packsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

rmSync(assetsDir, { recursive: true, force: true });
const packs: string[] = [];
for (const id of ids) {
  if (!PACK_ID.test(id) || RESERVED.has(id)) fail(`"${id}" cannot be a pack id`);
  const dir = join(packsDir, id);
  const manifest = join(dir, 'pack.json');
  if (!existsSync(manifest)) fail(`${id} has no pack.json`);
  const { name } = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown };
  if (typeof name !== 'string' || !name) fail(`${id}/pack.json needs a "name"`);

  const entries: string[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (file === 'pack.json' || file.startsWith('.')) continue;
    const extension = extname(file);
    const key = file.slice(0, -extension.length);
    if (!LAYER_KEY.test(key)) fail(`${id}/${file}: not a layer name (see BRIEF.md)`);
    if (extension === '.svg') {
      entries.push(
        `    ${JSON.stringify(key)}: { svg: ${JSON.stringify(readFileSync(join(dir, file), 'utf8'))} },`,
      );
    } else if (extension === '.png') {
      mkdirSync(join(assetsDir, id), { recursive: true });
      copyFileSync(join(dir, file), join(assetsDir, id, file));
      entries.push(
        `    ${JSON.stringify(key)}: { image: require('../../../assets/avatar-packs/${id}/${file}') },`,
      );
    } else {
      fail(`${id}/${file}: only .svg and .png layers`);
    }
  }
  packs.push(
    `  {\n    id: ${JSON.stringify(id)},\n    name: ${JSON.stringify(name)},\n    assets: {\n${entries.join('\n')}\n    },\n  },`,
  );
}

const body = packs.length ? `[\n${packs.join('\n')}\n]` : '[]';
// PNG layers are bundled with require(), which the lint rule only allows where it is needed.
const lint = packs.some((pack) => pack.includes('require('))
  ? '/* eslint-disable @typescript-eslint/no-require-imports */\n'
  : '';
writeFileSync(
  output,
  `// Written by \`pnpm avatar:packs\` from design/avatar-art/packs/*. Do not edit by hand.
${lint}import type { ArtPack } from './art-pack';

export const GENERATED_PACKS: readonly ArtPack[] = ${body};
`,
);
// The repository's format check covers the generated file too.
execFileSync('pnpm', ['exec', 'prettier', '--write', output], { cwd: root, stdio: 'ignore' });
console.log(`avatar:packs: ${packs.length} pack(s) written to ${output}`);
