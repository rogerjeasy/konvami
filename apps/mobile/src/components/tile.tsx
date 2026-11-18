import { createContext, useContext, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { logoPaths } from '@konvami/design-tokens';
import type { TextTone } from '@/components/text';
import { useTheme, type ColorToken } from '@/theme';

/**
 * The v4 colour blocks ("story tiles"). Each feature owns one: talking is tomato, words are pink,
 * the streak is butter, the level and goals are forest with lime, the week's focus is ink.
 * `card` is the plain white card for everything else.
 */
const LOOK = {
  tomato: {
    box: 'bg-tomato',
    ground: 'tomato',
    tone: 'onTomato',
    ink: 'onTomato',
    veil: 'bg-veil',
    dark: false,
  },
  forest: {
    box: 'bg-forest',
    ground: 'forest',
    tone: 'onForest',
    ink: 'onForest',
    veil: 'bg-veil-light',
    dark: true,
  },
  butter: {
    box: 'bg-butter',
    ground: 'butter',
    tone: 'onButter',
    ink: 'onButter',
    veil: 'bg-veil',
    dark: false,
  },
  pink: {
    box: 'bg-pink',
    ground: 'pink',
    tone: 'onPink',
    ink: 'onPink',
    veil: 'bg-veil',
    dark: false,
  },
  ink: {
    box: 'bg-inverse',
    ground: 'inverse',
    tone: 'onInverse',
    ink: 'onInverse',
    veil: 'bg-inverse-veil',
    dark: false,
  },
  card: {
    box: 'border border-border bg-chip',
    ground: 'chip',
    tone: 'fg',
    ink: 'fg',
    veil: 'bg-surface',
    dark: false,
  },
} as const satisfies Record<
  string,
  { box: string; ground: ColorToken; tone: TextTone; ink: ColorToken; veil: string; dark: boolean }
>;

export type TileColor = keyof typeof LOOK;

/** What a tile tells the things inside it: the text tone, the icon colour and the chip ground. */
type TileInk = {
  ground: ColorToken;
  tone: TextTone;
  ink: ColorToken;
  veil: string;
  dark: boolean;
};
const TileContext = createContext<TileInk | null>(null);

/** The tile around this component, if any (chips and icons take its colours). */
export function useTileInk(): TileInk | null {
  return useContext(TileContext);
}

/**
 * A rounded colour block. Text inside takes the block's own text colour through `tileTone()`;
 * `bubble` draws the logo's speech bubble faintly in a corner, as on the prototype.
 */
export function Tile({
  color: look,
  bubble,
  className,
  children,
  ...rest
}: ViewProps & {
  color: TileColor;
  bubble?: 'top-right' | 'bottom-left';
  className?: string;
  children: ReactNode;
}) {
  const l = LOOK[look];
  return (
    // A plain card is not a colour block: what is inside it keeps its usual colours.
    <TileContext.Provider value={look === 'card' ? null : l}>
      <View {...rest} className={`overflow-hidden rounded-hero p-5 ${l.box} ${className ?? ''}`}>
        {bubble ? <TileBubble place={bubble} ink={l.ink} /> : null}
        {children}
      </View>
    </TileContext.Provider>
  );
}

// The decorative bubble: big, faint, half outside the tile (pt and opacity from the prototype).
const BUBBLE_SIZE = 220;
const BUBBLE_OPACITY = 0.14;
const BUBBLE_OFFSET = -50;

function TileBubble({ place, ink }: { place: 'top-right' | 'bottom-left'; ink: ColorToken }) {
  const { color } = useTheme();
  const at =
    place === 'top-right'
      ? { right: BUBBLE_OFFSET, top: BUBBLE_OFFSET }
      : { left: BUBBLE_OFFSET, bottom: -BUBBLE_OFFSET / 2 };
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: BUBBLE_SIZE,
        height: BUBBLE_SIZE,
        opacity: BUBBLE_OPACITY,
        ...at,
      }}
    >
      <Svg width="100%" height="100%" viewBox="20 22 80 74">
        <Path d={logoPaths.bubble} fill={color[ink]} />
      </Svg>
    </View>
  );
}

/** A small rounded label laid on a tile ("10 min", "Friend"), in the tile's own colours. */
export function TileChip({ children }: { children: ReactNode }) {
  const tile = useTileInk();
  return (
    <View
      className={`min-h-8 flex-row items-center gap-1.5 self-start rounded-pill px-3 py-1 ${tile?.veil ?? 'bg-surface'}`}
    >
      {children}
    </View>
  );
}

/** The text tone for content inside the nearest tile (plain `fg` outside one). */
export function useTileTone(): TextTone {
  return useTileInk()?.tone ?? 'fg';
}
