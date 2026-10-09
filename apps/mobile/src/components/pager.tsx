import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { useTheme } from '@/theme';

/**
 * A horizontal, swipeable pager whose motion follows the finger on the UI thread: pages slide,
 * each page's illustration recedes as it leaves, and the page dots stretch as you swipe.
 * Used by the intro; reusable for any step-by-step flow.
 */

/**
 * How a page's illustration recedes while its page slides away: it shrinks towards its own centre
 * and dims. It NEVER moves sideways: any sideways drift pushes it towards the neighbouring page
 * and the two scenes meet at the seam. Shrinking only ever moves content away from the page edges,
 * so each page keeps at least its normal margin from its neighbour during the whole swipe.
 */
const RECEDE = { scale: 0.88, opacity: 0.35 } as const;

/** The illustration's style when its page is `offset` pages away (−1…1). Pure, so it is tested. */
export function recedeStyle(offset: number, reduced: boolean) {
  'worklet';
  const distance = Math.min(Math.abs(offset), 1);
  const opacity = interpolate(distance, [0, 1], [1, RECEDE.opacity], Extrapolation.CLAMP);
  if (reduced) return { opacity };
  const scale = interpolate(distance, [0, 1], [1, RECEDE.scale], Extrapolation.CLAMP);
  return { opacity, transform: [{ scale }] };
}

// A page counts as on screen while less than this far (in pages) from the current position.
const ON_SCREEN = 0.999;

/** Bit `i` is set when page `i` is at least partly on screen. */
export function visiblePages(position: number, count: number): number {
  'worklet';
  let mask = 0;
  for (let i = 0; i < count; i++) {
    if (Math.abs(position - i) < ON_SCREEN) mask |= 1 << i;
  }
  return mask;
}

/**
 * Scroll state shared by every animated part of the pager:
 * - `position`: the scroll position in pages (0, 0.5, 1, …), on the UI thread;
 * - `onPageChange`: called once when the nearest page changes (half way through a swipe);
 * - `isOnScreen(i)`: whether page `i` is at least partly visible. A page's scene starts playing as
 *   soon as you begin swiping towards it, so it animates in while it slides in.
 */
export function usePagerScroll(width: number, count: number, onPageChange: (page: number) => void) {
  const position = useSharedValue(0);
  const [onScreen, setOnScreen] = useState(1);
  const onScroll = useAnimatedScrollHandler((e) => {
    position.set(e.contentOffset.x / width);
  });
  const notify = useCallback((page: number) => onPageChange(page), [onPageChange]);
  // Each reaction calls back to React only when its value changes, never per frame.
  useAnimatedReaction(
    () => Math.round(position.get()),
    (page, previous) => {
      if (previous !== null && page !== previous) scheduleOnRN(notify, page);
    },
    [notify],
  );
  useAnimatedReaction(
    () => visiblePages(position.get(), count),
    (mask, previous) => {
      if (mask !== previous) scheduleOnRN(setOnScreen, mask);
    },
    [count],
  );
  const isOnScreen = useCallback((page: number) => (onScreen & (1 << page)) !== 0, [onScreen]);
  return { position, onScroll, isOnScreen };
}

/** A page's illustration: recedes (shrinks towards its centre, dims) as its page slides away. */
export function Recede({
  position,
  page,
  children,
}: {
  position: SharedValue<number>;
  page: number;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const style = useAnimatedStyle(() => recedeStyle(position.get() - page, reduced));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function Dot({ position, index }: { position: SharedValue<number>; index: number }) {
  const { color } = useTheme();
  const style = useAnimatedStyle(() => {
    const distance = Math.min(Math.abs(position.get() - index), 1);
    return {
      width: interpolate(distance, [0, 1], [size.pageDotActive, size.pageDot]),
      backgroundColor: interpolateColor(distance, [0, 1], [color.primary, color.track]),
    };
  });
  return (
    <Animated.View style={[{ height: size.pageDot, borderRadius: size.pageDot / 2 }, style]} />
  );
}

/** Page indicator that stretches with the swipe. Read by screen readers as "Page 2 of 3". */
export function PagerDots({
  position,
  count,
  active,
}: {
  position: SharedValue<number>;
  count: number;
  active: number;
}) {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('intro.pageOf', { current: active + 1, total: count })}
      className="flex-row gap-1.5"
    >
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} position={position} index={i} />
      ))}
    </View>
  );
}

export type PagerRef = AnimatedRef<Animated.ScrollView>;
