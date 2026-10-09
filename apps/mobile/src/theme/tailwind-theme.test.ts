/**
 * @jest-environment node
 */
import path from 'node:path';
import { fontFamily, kebab } from '@konvami/design-tokens';

/**
 * Builds the Tailwind theme the way NativeWind does on each platform. NativeWind's native preset
 * adds its own font classes (sans, serif, mono) after ours; this guards against one of them
 * silently replacing a Konvami font on iOS or Android (it rendered body text in a serif once).
 */
function resolvedTheme(os: 'ios' | 'android' | 'web') {
  const previous = process.env.NATIVEWIND_OS;
  process.env.NATIVEWIND_OS = os;
  try {
    jest.resetModules();
    // Fresh requires on purpose: the NativeWind preset reads NATIVEWIND_OS when it loads.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const loadConfig = require('tailwindcss/loadConfig');
    const resolveConfig = require('tailwindcss/resolveConfig');
    /* eslint-enable @typescript-eslint/no-require-imports */
    return resolveConfig(loadConfig(path.resolve(__dirname, '../../tailwind.config.ts'))).theme;
  } finally {
    process.env.NATIVEWIND_OS = previous;
  }
}

describe.each(['ios', 'android', 'web'] as const)('Tailwind theme on %s', (os) => {
  it('maps every font class to the Konvami font file', () => {
    const theme = resolvedTheme(os);
    for (const [token, file] of Object.entries(fontFamily)) {
      expect([kebab(token), theme.fontFamily[kebab(token)]]).toEqual([kebab(token), [file]]);
    }
  });
});
