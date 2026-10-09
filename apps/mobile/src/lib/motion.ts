import type { ViewStyle } from 'react-native';
import { cubicBezier, Easing, type CSSAnimationKeyframes } from 'react-native-reanimated';
import { motion } from '@konvami/design-tokens';

/**
 * Motion building blocks, all from the `motion` design tokens. Every entrance and loop is a
 * Reanimated CSS animation: it runs on the UI thread on iOS and Android, as a real CSS animation
 * on web, and replays whenever its view remounts. Components use these through
 * src/components/motion.tsx; screens never write keyframes for entrances themselves.
 */

const [o1, o2, o3, o4] = motion.easing.out;
const [m1, m2, m3, m4] = motion.easing.inOut;

/** For `withTiming`. */
export const EASE_OUT = Easing.bezier(o1, o2, o3, o4);
export const EASE_IN_OUT = Easing.bezier(m1, m2, m3, m4);
/** For Reanimated CSS transitions and animations. */
export const CSS_EASE_OUT = cubicBezier(o1, o2, o3, o4);
export const CSS_EASE_IN_OUT = cubicBezier(m1, m2, m3, m4);

export type Keyframes = CSSAnimationKeyframes<ViewStyle>;

/**
 * A keyframe step at `n` percent ("60%"). Native Reanimated only accepts `from`, `to`, a
 * percentage string or a 0–1 number; a bare 60 works on web but throws on iOS and Android.
 */
export function pct(n: number): `${number}%` {
  return `${n}%`;
}

const VALID_SELECTOR = /^(from|to|(100|[1-9]?\d)(\.\d+)?%)$/;

/** Throws on keyframe steps native Reanimated would reject. Run in development by every animation. */
export function assertValidKeyframes(keyframes: Keyframes): void {
  for (const key of Object.keys(keyframes)) {
    if (!VALID_SELECTOR.test(key)) {
      throw new Error(
        `Invalid keyframe step "${key}": use 'from', 'to' or pct(n) (e.g. "60%"). Bare numbers fail on iOS and Android.`,
      );
    }
  }
}

/** When the item at `order` starts, after an optional lead-in. */
export function staggerDelay(order: number, leadIn = 0): number {
  return leadIn + order * motion.stagger;
}

const FADE: Keyframes = { from: { opacity: 0 }, to: { opacity: 1 } };

/** Fade + rise: content entering the screen. Reduced motion keeps only the fade. */
export function riseKeyframes(reduced: boolean): Keyframes {
  if (reduced) return FADE;
  return {
    from: { opacity: 0, transform: [{ translateY: motion.rise }] },
    to: { opacity: 1, transform: [{ translateY: 0 }] },
  };
}

/**
 * A friendly pop with a small overshoot, for first-time moments only (logo, greetings, a saved
 * word). Reduced motion turns it into a plain fade.
 */
export function popKeyframes(reduced: boolean): Keyframes {
  if (reduced) return FADE;
  return {
    from: { opacity: 0, transform: [{ scale: motion.popFrom }] },
    [pct(60)]: { opacity: 1, transform: [{ scale: motion.popOvershoot }] },
    to: { opacity: 1, transform: [{ scale: 1 }] },
  };
}

/**
 * Grows up from a baseline (chart bars): slides up `distance` inside a parent that clips it.
 * Reduced motion keeps only the fade.
 */
export function growKeyframes(distance: number, reduced: boolean): Keyframes {
  if (reduced) return FADE;
  return {
    from: { transform: [{ translateY: distance }] },
    to: { transform: [{ translateY: 0 }] },
  };
}

// How far a sheet travels when it slides in (pt): enough to start below any sheet's top edge.
const SHEET_TRAVEL = 320;

/** Slide up from below (sheets). Reduced motion keeps only the fade. */
export function slideUpKeyframes(reduced: boolean): Keyframes {
  if (reduced) return FADE;
  return {
    from: { transform: [{ translateY: SHEET_TRAVEL }] },
    to: { transform: [{ translateY: 0 }] },
  };
}
