import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { vars } from 'nativewind';
import { cssVar, type ColorToken, type Palette } from '@konvami/design-tokens';
import { useTheme } from '@/theme';

/**
 * Screens that are one colour block from edge to edge (v4): the call is forest with lime, the
 * end of a conversation is butter. For each, which palette token each theme role takes on it.
 */
const BLOCKS = {
  forest: {
    ground: 'bg-forest',
    statusBar: 'light',
    roles: {
      bg: 'forest',
      surface: 'veilLight',
      chip: 'veilLight',
      secondaryBg: 'veilLight',
      border: 'veilLight',
      fieldBorder: 'veilLight',
      track: 'veilLight',
      fg: 'onForest',
      fgMuted: 'onForestMuted',
      fgSubtle: 'onForestMuted',
      primary: 'lime',
      onPrimary: 'onLime',
      primarySoft: 'veilLight',
      primaryText: 'lime',
    },
  },
  butter: {
    ground: 'bg-butter',
    statusBar: 'dark',
    roles: {
      bg: 'butter',
      surface: 'veil',
      chip: 'veil',
      secondaryBg: 'veil',
      border: 'veil',
      fieldBorder: 'veil',
      track: 'veil',
      fg: 'onButter',
      fgMuted: 'onButter',
      fgSubtle: 'onButter',
      // The block's own dark ink, in both themes: paper on butter would not read.
      primary: 'onButter',
      onPrimary: 'butter',
      primarySoft: 'veil',
      primaryText: 'onButter',
    },
  },
} as const satisfies Record<
  string,
  {
    ground: string;
    statusBar: 'light' | 'dark';
    roles: Partial<Record<ColorToken, ColorToken>>;
  }
>;

export type Block = keyof typeof BLOCKS;

function blockVariables(block: Block, p: Palette) {
  return vars(
    Object.fromEntries(
      Object.entries(BLOCKS[block].roles).map(([role, token]) => [
        cssVar(role as ColorToken),
        p[token],
      ]),
    ),
  );
}

/**
 * Lays a colour block over everything inside it, by giving the theme's colour variables the
 * block's values (as `ThemeScope` does per theme). Sheets open in their own `ThemeScope`, so
 * they keep the app's normal colours. Raw colours read with `useTheme()` (SVG icons) do not
 * follow: pass the block's own tokens to those.
 */
export function BlockScope({ block, children }: { block: Block; children: ReactNode }) {
  const { scheme, color } = useTheme();
  const style = useMemo(() => blockVariables(block, color), [block, color]);
  const { ground, statusBar } = BLOCKS[block];
  return (
    <View key={scheme} style={style} className={`flex-1 ${ground}`}>
      <StatusBar style={statusBar} />
      {children}
    </View>
  );
}
