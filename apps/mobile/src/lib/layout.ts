import { breakpoint, size, space } from '@konvami/design-tokens';

/**
 * Responsive layout rules, as pure functions of the window and the OS text size, so they are unit
 * tested and every screen follows the same rules. Principles:
 * - Text never gets a fixed height: blocks grow, and screens scroll when content is taller.
 * - Wide windows (tablet, landscape, desktop web) put the illustration beside the text.
 * - Text columns stay readable (size.contentMaxWidth); whole screens stop at size.screenMaxWidth.
 */

/** Text inside illustrations may grow with the OS text size, up to this factor, so the drawing keeps its shape. */
export const ILLUSTRATION_MAX_FONT_SCALE = 1.25;

/** Above this OS text scale, layouts favour stacking and scrolling over side-by-side. */
const LARGE_TEXT_SCALE = 1.5;

/**
 * Share of the window height the hero panel takes on a tall portrait phone with default text
 * size. This is the intro's; a screen with more text below its hero asks for a smaller share.
 */
export const HERO_HEIGHT_RATIO = 0.56;

/** Below this window height (small phones, split view) the hero sizes to its drawing instead. */
const TALL_WINDOW = 700;

export interface WindowMetrics {
  width: number;
  height: number;
  /** OS text-size multiplier (Dynamic Type / Android font scale). */
  fontScale: number;
}

export interface ScreenLayout {
  /** Narrow phone (e.g. iPhone SE, small Android): tighter gutters. */
  compact: boolean;
  /** Illustration and text side by side. */
  split: boolean;
  /** Horizontal padding of the screen content. */
  gutter: number;
  /** Minimum height of the hero panel when stacked; 0 lets it size to its content. */
  heroMinHeight: number;
  /** Width the illustration is drawn at. */
  illustrationWidth: number;
}

export function screenLayout(
  { width, height, fontScale }: WindowMetrics,
  heroShare: number = HERO_HEIGHT_RATIO,
): ScreenLayout {
  const compact = width < breakpoint.compact;
  const largeText = fontScale >= LARGE_TEXT_SCALE;
  const landscape = width > height;
  const split =
    width >= breakpoint.wide && (landscape || width >= breakpoint.wide * 1.3) && !largeText;
  const gutter = compact ? space.lg : space['2xl'];

  const columnWidth = split ? Math.min(width, size.screenMaxWidth) / 2 : width;
  const illustrationWidth = Math.min(columnWidth - gutter * 2, size.illustrationMaxWidth);

  // Large text and short windows need the room for words: the hero sizes to its drawing and the
  // content scrolls.
  const heroMinHeight =
    split || largeText || height < TALL_WINDOW ? 0 : Math.round(height * heroShare);

  return { compact, split, gutter, heroMinHeight, illustrationWidth };
}

/** The tallest a square hero drawing may be, as a share of the window height. */
const HERO_DRAWING_MAX_HEIGHT_RATIO = 0.36;

/**
 * Side of a square hero drawing (the microphone, the greeting): its design frame, but never wider
 * than the space between the gutters, and smaller on a short window so the title under it is
 * still on screen without scrolling.
 */
export function heroDrawingSize({
  frame,
  available,
  windowHeight,
}: {
  /** The side the drawing has on the design. */
  frame: number;
  /** Width available for it (`ScreenLayout.illustrationWidth`). */
  available: number;
  windowHeight: number;
}): number {
  return Math.min(frame, available, Math.round(windowHeight * HERO_DRAWING_MAX_HEIGHT_RATIO));
}

/** Up to this OS text scale the five tab names fit side by side on a standard phone. */
const TAB_LABELS_MAX_FONT_SCALE = 1.3;

/**
 * Whether the bottom tab bar names every tab. On compact phones and at large text sizes only
 * the open tab keeps its name (the others keep their icon and their accessible label), so no
 * name is ever cut off, whatever the language.
 */
export function showAllTabLabels({
  width,
  fontScale,
}: Pick<WindowMetrics, 'width' | 'fontScale'>): boolean {
  return width >= breakpoint.compact && fontScale <= TAB_LABELS_MAX_FONT_SCALE;
}
