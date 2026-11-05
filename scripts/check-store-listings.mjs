// Checks docs/store/listings/<lang>.md: every field fits the store's limit, and all four languages
// have the same fields. A heading ends in "(max N)" or "(max N bytes)", and the field is the
// ```text block under it. Run with `pnpm check:store`; it needs no install.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LISTINGS = new URL('../docs/store/listings/', import.meta.url).pathname;
const HEADING = /^## (.+?) \(max (\d+)( bytes)?\)\s*$/;

/** The fields of one listing file: heading text, limit, whether it counts bytes, and the text. */
function fields(file) {
  const lines = readFileSync(join(LISTINGS, file), 'utf8').split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    const heading = HEADING.exec(lines[i] ?? '');
    if (!heading) continue;
    const start = lines.findIndex((line, at) => at > i && line.startsWith('```text'));
    const end = lines.findIndex((line, at) => at > start && line.startsWith('```'));
    found.push({
      name: heading[1],
      limit: Number(heading[2]),
      bytes: Boolean(heading[3]),
      text: lines.slice(start + 1, end).join('\n'),
    });
  }
  return found;
}

const files = readdirSync(LISTINGS).filter((name) => name.endsWith('.md'));
const problems = [];
const shapes = new Map();

for (const file of files) {
  const found = fields(file);
  shapes.set(file, found.map((field) => field.limit).join(','));
  for (const { name, limit, bytes, text } of found) {
    const size = bytes ? Buffer.byteLength(text, 'utf8') : Array.from(text).length;
    if (size > limit) problems.push(`${file}: "${name}" is ${size}, over its limit of ${limit}`);
    if (!text.trim()) problems.push(`${file}: "${name}" is empty`);
  }
}

if (new Set(shapes.values()).size > 1) {
  problems.push(`the listings do not have the same fields or limits: ${[...shapes].join(' | ')}`);
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`store listings: ${files.length} languages, all fields within their limits`);
