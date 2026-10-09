import type { ReactNode } from 'react';
import { View, type Role } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import {
  brand,
  LOGO_GRID,
  logoPaths,
  MARK_VIEWBOX,
  TILE_RADIUS,
  WORDMARK_ASPECT,
  WORDMARK_VIEWBOX,
  wordmarkPath,
} from '@konvami/design-tokens';

/** Exposes a drawing to screen readers under `label`, or hides it when it is decorative. */
function Graphic({ label, role, children }: { label?: string; role: Role; children: ReactNode }) {
  return label ? (
    <View accessible role={role} aria-label={label}>
      {children}
    </View>
  ) : (
    <View aria-hidden>{children}</View>
  );
}

/**
 * The Konvami logo, drawn from the shared geometry in @konvami/design-tokens (the same source as
 * the app icon PNGs). `tile` adds the rounded teal app-icon tile; without it the mark is the white
 * bubble alone, for dark or teal grounds.
 */
export function LogoMark({
  size,
  tile = false,
  label,
}: {
  size: number;
  tile?: boolean;
  /** Accessible name; omit when the logo is decorative (a visible app name sits next to it). */
  label?: string;
}) {
  const p = logoPaths;
  return (
    <Graphic label={label} role="img">
      <Svg
        width={size}
        height={size}
        viewBox={tile ? `0 0 ${LOGO_GRID} ${LOGO_GRID}` : MARK_VIEWBOX}
      >
        {tile ? (
          <Rect width={LOGO_GRID} height={LOGO_GRID} rx={TILE_RADIUS} fill={brand.tile} />
        ) : null}
        <Path d={p.bubble} fill={brand.bubble} />
        {p.eyes.map((eye) => (
          <Circle key={eye.cx} cx={eye.cx} cy={eye.cy} r={eye.r} fill={brand.face} />
        ))}
        <Path d={p.tongue} fill={brand.tongue} />
        <Path
          d={p.tongueLine}
          stroke={brand.tongueLine}
          strokeWidth={p.tongueLineWidth}
          strokeLinecap="round"
        />
        <Path
          d={p.smile}
          fill="none"
          stroke={brand.face}
          strokeWidth={p.smileWidth}
          strokeLinecap="round"
        />
      </Svg>
    </Graphic>
  );
}

/** The "Konvami" wordmark at a given height, in any color (text color by default). */
export function Wordmark({
  height,
  color,
  label,
}: {
  height: number;
  color: string;
  label?: string;
}) {
  const v = WORDMARK_VIEWBOX;
  return (
    <Graphic label={label} role="img">
      <Svg
        width={height * WORDMARK_ASPECT}
        height={height}
        viewBox={`${v.minX} ${v.minY} ${v.width} ${v.height}`}
      >
        <Path d={wordmarkPath} fill={color} />
      </Svg>
    </Graphic>
  );
}
