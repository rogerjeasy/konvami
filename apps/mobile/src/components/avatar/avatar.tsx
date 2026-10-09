import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { avatar, motion, opacity } from '@konvami/design-tokens';
import { Loop } from '@/components/motion';
import { CSS_EASE_OUT, pct, type Keyframes } from '@/lib/motion';
import type { AvatarLook, AvatarMood, HairStyle } from './look';

/**
 * A persona's portrait, drawn from its look (spec §6.20). It breathes and blinks, tilts its head
 * while a reply is prepared, leans in while the learner speaks, and moves its mouth with the
 * voice. Decorative: the screen around it says in words what is happening.
 *
 * The drawing is a stack of layers on one 200 × 200 design box, each scaled with the avatar's
 * size. Eyes and mouth are layers of their own so they can move without redrawing the face.
 */

// The design box every layer is drawn on.
const BOX = 200;
// Where the eyes and the mouth sit in the box (the points their movement turns around).
const EYE_LINE = 96;
const LIP_LINE = 116;
const EYES = [86, 114] as const;

// How each mood holds the head: a small tilt or lean, never a jump.
const POSE: Record<AvatarMood, { rotate: number; scale: number }> = {
  idle: { rotate: 0, scale: 1 },
  waiting: { rotate: 0, scale: 1 },
  attentive: { rotate: 0, scale: 1.03 },
  thinking: { rotate: -3, scale: 1 },
  speaking: { rotate: 0, scale: 1 },
};
// Breathing lifts the portrait by this share of its size.
const BREATH_SCALE = 1.012;
// A mouth that is "open" shows from this share of its full height, so it never opens from nothing.
const MOUTH_MIN_SCALE = 0.3;
// The smile hands over to the open mouth within the first third of opening.
const MOUTH_CROSSFADE = 3;

const BREATHE: Keyframes = {
  from: { transform: [{ scale: 1 }] },
  to: { transform: [{ scale: BREATH_SCALE }] },
};
// Open nearly all the time; closed for a moment near the end of each cycle.
const BLINK: Keyframes = {
  from: { transform: [{ scaleY: 1 }] },
  [pct(94)]: { transform: [{ scaleY: 1 }] },
  [pct(97)]: { transform: [{ scaleY: 0.1 }] },
  to: { transform: [{ scaleY: 1 }] },
};

// Hair drawn behind the head and shoulders (the length of longer styles).
const HAIR_BEHIND: Partial<Record<HairStyle, string>> = {
  bob: 'M56 96 C50 44 150 44 144 96 L146 132 C140 140 130 138 128 130 L128 96 L72 96 L72 130 C70 138 60 140 54 132 Z',
  long: 'M56 96 C50 44 150 44 144 96 L150 172 C142 182 130 180 128 170 L128 96 L72 96 L72 170 C70 180 58 182 50 172 Z',
};
// Hair drawn over the top of the head (the hairline).
const CAP =
  'M62 92 C58 54 80 38 100 38 C120 38 142 54 138 92 C134 74 124 62 100 60 C78 62 66 74 62 92 Z';
const HAIR_ON_TOP: Partial<Record<HairStyle, string>> = {
  short: CAP,
  bob: CAP,
  long: CAP,
  bun: CAP,
  curls: CAP,
  parted:
    'M62 94 C56 52 84 36 104 38 C126 40 144 58 138 94 C134 78 128 68 116 64 C100 72 78 70 66 80 Z',
};
// The curls of the `curls` style, as circles around the crown: [x, y, radius].
const CURLS = [
  [72, 62, 16],
  [88, 48, 17],
  [108, 46, 17],
  [126, 58, 16],
  [62, 82, 13],
  [138, 80, 13],
] as const;

const FACE =
  'M64 88 C64 58 82 46 100 46 C118 46 136 58 136 88 C136 112 124 136 100 138 C76 136 64 112 64 88 Z';
const BEARD =
  'M66 100 C68 128 82 142 100 142 C118 142 132 128 134 100 C128 118 116 126 100 126 C84 126 72 118 66 100 Z';
const SHOULDERS = 'M24 200 C24 168 52 152 86 148 L114 148 C148 152 176 168 176 200 Z';
const NECK = 'M86 118 L86 150 Q100 160 114 150 L114 118 Z';
const SMILE = 'M89 116 Q100 125 111 116';
const OPEN_MOUTH = 'M89 116 Q100 112 111 116 Q108 131 100 131 Q92 131 89 116 Z';

/** One layer of the drawing: a full-size SVG on the design box. */
function Layer({ children }: { children: ReactNode }) {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${BOX} ${BOX}`}>
      {children}
    </Svg>
  );
}

const FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;
/** The point a layer's transform turns around: centred, at height `y` of the design box. */
const originAt = (y: number) => `50% ${(y / BOX) * 100}%`;

function Portrait({ look }: { look: AvatarLook }) {
  const skin = avatar.skin[look.skin];
  const hair = avatar.hair[look.hairColor];
  const behind = HAIR_BEHIND[look.hair];
  const onTop = HAIR_ON_TOP[look.hair];
  return (
    <Layer>
      <Circle cx={BOX / 2} cy={BOX / 2} r={BOX / 2} fill={avatar.backdrop[look.backdrop]} />
      <G>
        {behind ? <Path d={behind} fill={hair} /> : null}
        <Path d={SHOULDERS} fill={avatar.top[look.top]} />
        <Path d={NECK} fill={skin.shade} />
        <Ellipse cx={63} cy={98} rx={5.5} ry={9} fill={skin.shade} />
        <Ellipse cx={137} cy={98} rx={5.5} ry={9} fill={skin.shade} />
        <Path d={FACE} fill={skin.base} />
        {look.beard ? <Path d={BEARD} fill={hair} /> : null}
        {look.hair === 'bun' ? <Circle cx={100} cy={34} r={15} fill={hair} /> : null}
        {look.hair === 'curls'
          ? CURLS.map(([cx, cy, r]) => (
              <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={hair} />
            ))
          : null}
        {onTop ? <Path d={onTop} fill={hair} /> : null}
        <Path
          d="M78 84 Q86 79 94 83 M106 83 Q114 79 122 84"
          stroke={avatar.feature}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M99 101 Q97 109 101 111"
          stroke={skin.shade}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
        {look.glasses ? (
          <G stroke={avatar.glasses} strokeWidth={2.5} fill="none">
            <Rect x={72} y={86} width={24} height={19} rx={7} />
            <Rect x={104} y={86} width={24} height={19} rx={7} />
            <Path d="M96 94 Q100 91 104 94" />
          </G>
        ) : null}
      </G>
    </Layer>
  );
}

function Eyes() {
  return (
    <Layer>
      {EYES.map((x) => (
        <G key={x}>
          <Ellipse cx={x} cy={EYE_LINE} rx={6} ry={3.7} fill={avatar.eyeWhite} />
          <Circle cx={x} cy={EYE_LINE} r={3.3} fill={avatar.feature} />
          {/* The upper lid, which is what makes an eye look relaxed instead of startled. */}
          <Path
            d={`M${x - 6.5} ${EYE_LINE - 1} Q${x} ${EYE_LINE - 6} ${x + 6.5} ${EYE_LINE - 1}`}
            stroke={avatar.feature}
            strokeWidth={1.8}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      ))}
    </Layer>
  );
}

/** The mouth: a smile at rest, opening with `open` (0–1) while the persona speaks. */
function Mouth({ open }: { open?: SharedValue<number> }) {
  const reduced = useReducedMotion();
  const smile = useAnimatedStyle(() => ({
    opacity: open ? 1 - Math.min(open.get() * MOUTH_CROSSFADE, 1) : 1,
  }));
  const opened = useAnimatedStyle(() => {
    const amount = open ? open.get() : 0;
    return {
      opacity: Math.min(amount * MOUTH_CROSSFADE, 1),
      // Reduce Motion: the mouth still shows that she is speaking, without moving.
      transform: [{ scaleY: reduced ? 1 : MOUTH_MIN_SCALE + (1 - MOUTH_MIN_SCALE) * amount }],
    };
  });
  return (
    <>
      <Animated.View style={[FILL, smile]}>
        <Layer>
          <Path d={SMILE} stroke={avatar.lip} strokeWidth={3.2} strokeLinecap="round" fill="none" />
        </Layer>
      </Animated.View>
      <Animated.View style={[FILL, { transformOrigin: originAt(LIP_LINE) }, opened]}>
        <Layer>
          <Path d={OPEN_MOUTH} fill={avatar.mouth} />
        </Layer>
      </Animated.View>
    </>
  );
}

export function Avatar({
  look,
  size,
  mood = 'idle',
  mouth,
  still = false,
}: {
  look: AvatarLook;
  /** Width and height (pt). */
  size: number;
  mood?: AvatarMood;
  /** How far the mouth is open, 0–1, updated from the live voice level. */
  mouth?: SharedValue<number>;
  /** A portrait that does not move (small list and card avatars). */
  still?: boolean;
}) {
  const reduced = useReducedMotion();
  const pose = POSE[mood];
  const alive = !still && mood !== 'waiting';
  return (
    <View
      aria-hidden
      // The round frame: whatever the portrait does inside (shoulders, a lean) stays within it.
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <Animated.View
        style={[
          FILL,
          {
            opacity: mood === 'waiting' ? opacity.decorative : 1,
            transform:
              reduced || still ? [] : [{ rotate: `${pose.rotate}deg` }, { scale: pose.scale }],
            transitionProperty: ['transform', 'opacity'],
            transitionDuration: `${motion.base}ms`,
            transitionTimingFunction: CSS_EASE_OUT,
          },
        ]}
      >
        <Loop keyframes={BREATHE} duration={motion.breathe} alternate play={alive} style={FILL}>
          <View style={FILL}>
            <Portrait look={look} />
          </View>
          <Loop
            keyframes={BLINK}
            duration={motion.blink}
            linear
            play={alive}
            style={[FILL, { transformOrigin: originAt(EYE_LINE) }]}
          >
            <Eyes />
          </Loop>
          <Mouth open={still ? undefined : mouth} />
        </Loop>
      </Animated.View>
    </View>
  );
}
