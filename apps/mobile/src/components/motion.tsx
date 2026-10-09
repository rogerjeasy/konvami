import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion, type CSSAnimationProperties } from 'react-native-reanimated';
import { motion } from '@konvami/design-tokens';
import {
  assertValidKeyframes,
  CSS_EASE_IN_OUT,
  CSS_EASE_OUT,
  popKeyframes,
  riseKeyframes,
  type Keyframes,
} from '@/lib/motion';

/**
 * Reusable motion wrappers. Screens never write animation code inline: they wrap content in
 * these, so timing, easing and Reduce Motion behave the same everywhere.
 *
 * `play` lets a parent decide when an entrance runs (e.g. when an intro slide becomes active):
 * while false the content is hidden; when it turns true the content mounts and animates in.
 */

type EntranceProps = {
  children: ReactNode;
  /** Milliseconds before this item starts (use staggerDelay for lists). */
  delay?: number;
  play?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Plays `keyframes` once when it mounts (and again each time `play` turns true). Before it starts,
 * the content holds the first keyframe, so nothing flashes in its final state.
 */
export function Animate({
  children,
  keyframes,
  duration = motion.enter,
  delay = 0,
  play = true,
  easing = 'out',
  style,
}: EntranceProps & {
  keyframes: Keyframes;
  duration?: number;
  easing?: 'out' | 'inOut';
}) {
  if (__DEV__) assertValidKeyframes(keyframes);
  const animation: CSSAnimationProperties<ViewStyle> | null = play
    ? {
        animationName: keyframes,
        animationDuration: `${duration}ms`,
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
        animationTimingFunction: easing === 'out' ? CSS_EASE_OUT : CSS_EASE_IN_OUT,
      }
    : null;
  return (
    <Animated.View
      key={play ? 'play' : 'idle'}
      style={[style, animation, play ? null : { opacity: 0 }]}
    >
      {children}
    </Animated.View>
  );
}

/** Fades in while rising a little: titles, text, cards, buttons. */
export function Reveal(props: EntranceProps) {
  const reduced = useReducedMotion();
  const keyframes = useMemo(() => riseKeyframes(reduced), [reduced]);
  return <Animate {...props} keyframes={keyframes} />;
}

/** Pops in with a small overshoot: logos, greetings, celebratory details. */
export function Pop(props: EntranceProps) {
  const reduced = useReducedMotion();
  const keyframes = useMemo(() => popKeyframes(reduced), [reduced]);
  return <Animate {...props} keyframes={keyframes} duration={motion.spring.pop.duration} />;
}

/**
 * An ambient loop (breathing, floating, turning) as a Reanimated CSS animation. Off when Reduce
 * Motion is on: ambient motion is decoration, never information.
 */
export function Loop({
  keyframes,
  duration,
  delay = 0,
  linear = false,
  alternate = false,
  play = true,
  style,
  children,
}: {
  keyframes: Keyframes;
  duration: number;
  delay?: number;
  /** Constant motion (a turning ring) instead of ease-in-out. */
  linear?: boolean;
  /** Play forwards then backwards (breathing), instead of restarting. */
  alternate?: boolean;
  play?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  if (__DEV__) assertValidKeyframes(keyframes);
  const animation: CSSAnimationProperties<ViewStyle> | null =
    play && !reduced
      ? {
          animationName: keyframes,
          animationDuration: `${duration}ms`,
          animationDelay: `${delay}ms`,
          animationIterationCount: 'infinite',
          animationDirection: alternate ? 'alternate' : 'normal',
          animationTimingFunction: linear ? 'linear' : CSS_EASE_IN_OUT,
        }
      : null;
  return <Animated.View style={[style, animation]}>{children}</Animated.View>;
}

/**
 * Press feedback for button-like controls: shrinks to `motion.pressScale` while the finger is
 * down (feedback on press-in, action on press-out). Takes the control's whole look as children.
 */
export function PressScale({
  children,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      pressRetentionOffset={16}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [{ scale: pressed && !rest.disabled ? motion.pressScale : 1 }],
            transitionProperty: 'transform',
            transitionDuration: `${motion.press}ms`,
            transitionTimingFunction: CSS_EASE_OUT,
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
