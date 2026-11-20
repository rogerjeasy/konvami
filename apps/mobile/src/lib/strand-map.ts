/**
 * Where the strand map (7.14) draws a place: a simple projection of the part of Europe Konvami's
 * places sit in onto the drawing's box. A place outside it (the US, Canada) sits on the nearest
 * edge, so a line still points the right way. Nothing finer than a city ever reaches here.
 */

// The part of the world the drawing shows, in degrees.
export const MAP_BOUNDS = { west: -11, east: 21, south: 36, north: 60 } as const;
// The drawing's box, in its own units, and the margin kept free of dots so labels fit.
export const MAP_WIDTH = 320;
export const MAP_HEIGHT = 300;
const MARGIN = 18;
// How far a strand bows from a straight line, as a part of its length.
const BOW = 0.22;

export interface MapPoint {
  x: number;
  y: number;
  /** The place is outside the drawing and was put on its edge. */
  edge: boolean;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** A place's position in the drawing (equirectangular, its north at the top). */
export function project(latitude: number, longitude: number): MapPoint {
  const { west, east, south, north } = MAP_BOUNDS;
  const edge = longitude < west || longitude > east || latitude < south || latitude > north;
  const u = (clamp(longitude, west, east) - west) / (east - west);
  const v = (north - clamp(latitude, south, north)) / (north - south);
  return {
    x: MARGIN + u * (MAP_WIDTH - 2 * MARGIN),
    y: MARGIN + v * (MAP_HEIGHT - 2 * MARGIN),
    edge,
  };
}

/** An SVG path that bows gently from one point to another, as a thread would. */
export function strandPath(from: MapPoint, to: MapPoint): string {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // The control point sits off the middle, at right angles to the line.
  const cx = midX - dy * BOW;
  const cy = midY + dx * BOW;
  const r = (n: number) => Math.round(n * 10) / 10;
  return `M${r(from.x)} ${r(from.y)} Q${r(cx)} ${r(cy)} ${r(to.x)} ${r(to.y)}`;
}
