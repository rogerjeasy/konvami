import { de } from './locales/de';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { it as italian } from './locales/it';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? { ...acc, [path]: value }
      : { ...acc, ...flatten(value, path) };
  }, {});
}

/** Interpolations ({{x}}) and markup tags (<em>) a translation must keep. */
const tokensOf = (s: string) => [...s.matchAll(/{{\s*\w+\s*}}|<\/?\w+>/g)].map((m) => m[0]).sort();

const source = flatten(en as unknown as Tree);

describe.each([
  ['de', de],
  ['fr', fr],
  ['it', italian],
])('%s locale', (_, locale) => {
  const strings = flatten(locale as unknown as Tree);

  it('has every English key and no extra ones', () => {
    expect(Object.keys(strings).sort()).toEqual(Object.keys(source).sort());
  });

  it('keeps every placeholder and markup tag', () => {
    for (const [key, value] of Object.entries(source)) {
      expect([key, tokensOf(strings[key] ?? '')]).toEqual([key, tokensOf(value)]);
    }
  });

  it('has no empty strings', () => {
    expect(Object.entries(strings).filter(([, v]) => !v.trim())).toEqual([]);
  });
});
