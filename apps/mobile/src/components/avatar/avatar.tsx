import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { avatar, motion, opacity, type AvatarEyes } from '@konvami/design-tokens';
import { Loop, Pop } from '@/components/motion';
import { visemeIndex, VISEMES, type Viseme } from '@/lib/lip-sync';
import { CSS_EASE_OUT, pct, type Keyframes } from '@/lib/motion';
import type {
  AvatarExpression,
  AvatarGesture,
  AvatarLook,
  AvatarMood,
  FaceShape,
  HairStyle,
} from './look';

/**
 * A persona's portrait, drawn from its look (spec §6.20). It breathes and blinks, tilts its head
 * while a reply is prepared, leans in while the learner speaks, moves its mouth with the voice
 * and shows an expression (brows, eyes and a resting mouth) the partner chooses. Decorative: the
 * screen around it says in words what is happening.
 *
 * The drawing is a stack of layers on one 200 × 200 design box, each scaled with the avatar's
 * size. Brows, eyes and mouth are layers of their own so they can change without redrawing the
 * face.
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
// The thoughtful "hmm" of a correction: the head tilts the other way from "thinking".
const HMM_POSE = { rotate: 4, scale: 1 } as const;
// Breathing lifts the portrait by this share of its size.
const BREATH_SCALE = 1.012;
// A mouth that is "open" shows from this share of its full height, so it never opens from nothing.
const MOUTH_MIN_SCALE = 0.3;
// The resting mouth hands over to the open mouth within the first third of opening.
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

// The face, one outline per shape; the oval is the original portrait.
const FACE: Record<FaceShape, string> = {
  oval: 'M64 88 C64 58 82 46 100 46 C118 46 136 58 136 88 C136 112 124 136 100 138 C76 136 64 112 64 88 Z',
  round:
    'M62 88 C62 56 80 45 100 45 C120 45 138 56 138 88 C138 114 124 138 100 139 C76 138 62 114 62 88 Z',
  narrow:
    'M67 88 C67 58 83 46 100 46 C117 46 133 58 133 88 C133 114 121 138 100 140 C79 138 67 114 67 88 Z',
};
const BEARD =
  'M66 100 C68 128 82 142 100 142 C118 142 132 128 134 100 C128 118 116 126 100 126 C84 126 72 118 66 100 Z';
const SHOULDERS = 'M24 200 C24 168 52 152 86 148 L114 148 C148 152 176 168 176 200 Z';
const NECK = 'M86 118 L86 150 Q100 160 114 150 L114 118 Z';
// Age lines: forehead, the corners of the eyes, and the folds from the nose to the mouth.
const AGE_LINES =
  'M82 68 Q100 64 118 68 M72 98 L67 101 M72 102 L68 106 M128 98 L133 101 M128 102 L132 106 M88 122 Q84 130 87 137 M112 122 Q116 130 113 137';
const NOSE = 'M99 101 Q97 109 101 111';

// What the face shows for each expression: the brows, the mouth at rest, and how far the eyes
// are open (1 is the usual; above is wider, below is narrowed).
interface FaceState {
  brows: string;
  mouth: string;
  eyes: number;
}
const FACES: Record<AvatarExpression, FaceState> = {
  neutral: {
    brows: 'M78 84 Q86 79 94 83 M106 83 Q114 79 122 84',
    mouth: 'M89 116 Q100 125 111 116',
    eyes: 1,
  },
  happy: {
    brows: 'M78 82 Q86 77 94 81 M106 81 Q114 77 122 82',
    mouth: 'M87 115 Q100 128 113 115',
    eyes: 0.85,
  },
  surprised: {
    brows: 'M78 79 Q86 73 94 78 M106 78 Q114 73 122 79',
    mouth: 'M96 118 Q100 113 104 118 Q104 125 100 125 Q96 125 96 118 Z',
    eyes: 1.3,
  },
  empathetic: {
    brows: 'M78 85 Q86 82 94 79 M106 79 Q114 82 122 85',
    mouth: 'M91 118 Q100 121 109 118',
    eyes: 1,
  },
  encouraging: {
    brows: 'M78 82 Q86 78 94 82 M106 82 Q114 78 122 82',
    mouth: 'M88 115 Q100 126 112 115',
    eyes: 1.05,
  },
  confused: {
    brows: 'M78 86 Q86 83 94 85 M106 79 Q114 76 122 80',
    mouth: 'M90 119 Q96 115 100 118 Q105 122 110 117',
    eyes: 1,
  },
  amused: {
    brows: 'M78 84 Q86 80 94 83 M106 80 Q114 75 122 79',
    mouth: 'M90 117 Q102 125 111 114',
    eyes: 0.8,
  },
};
// The "hmm" gesture: brows drawn together, lips pursed to one side.
const HMM_FACE: FaceState = {
  brows: 'M78 86 Q86 83 94 86 M106 86 Q114 83 122 86',
  mouth: 'M92 118 Q100 117 108 119',
  eyes: 0.9,
};

// The mouth shapes of the voice (see `lib/lip-sync.ts`), each with the teeth it shows, if any.
const MOUTHS: Record<Exclude<Viseme, 'closed'>, { shape: string; teeth?: string }> = {
  narrow: { shape: 'M88 116 Q100 118 112 116 Q106 122 100 122 Q94 122 88 116 Z' },
  mid: { shape: 'M91 115 Q100 112 109 115 Q107 127 100 127 Q93 127 91 115 Z' },
  open: { shape: 'M89 116 Q100 112 111 116 Q108 131 100 131 Q92 131 89 116 Z' },
  round: { shape: 'M94 113 Q100 110 106 113 Q109 123 100 128 Q91 123 94 113 Z' },
  pucker: { shape: 'M96 115 Q100 112 104 115 Q105 121 100 122 Q95 121 96 115 Z' },
  teeth: {
    shape: 'M89 115 Q100 112 111 115 Q108 124 100 124 Q92 124 89 115 Z',
    teeth: 'M92 115 Q100 113 108 115 L108 117.5 Q100 116 92 117.5 Z',
  },
};
const SPEECH_VISEMES = VISEMES.filter((v): v is Exclude<Viseme, 'closed'> => v !== 'closed');

// The thumbs-up of a gesture, on the lower right of the portrait (inside the round frame).
const THUMB = 'M134 146 L134 134 Q134 127 140 127 Q145 127 145 134 L145 146';
const FIST = { x: 130, y: 146, width: 26, height: 22, rx: 6 } as const;
const HAND_STROKE = 1.8;

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
// The expression changes quickly and softly, as the head's pose does.
const EASED = {
  transitionDuration: `${motion.base}ms`,
  transitionTimingFunction: CSS_EASE_OUT,
} as const;

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
        <Path d={FACE[look.face ?? 'oval']} fill={skin.base} />
        {look.aged ? (
          <Path
            d={AGE_LINES}
            stroke={skin.shade}
            strokeWidth={1.8}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
        {look.beard ? <Path d={BEARD} fill={hair} /> : null}
        {look.hair === 'bun' ? <Circle cx={100} cy={34} r={15} fill={hair} /> : null}
        {look.hair === 'curls'
          ? CURLS.map(([cx, cy, r]) => (
              <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={hair} />
            ))
          : null}
        {onTop ? <Path d={onTop} fill={hair} /> : null}
        <Path d={NOSE} stroke={skin.shade} strokeWidth={2} strokeLinecap="round" fill="none" />
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

function Brows({ path }: { path: string }) {
  return (
    <Layer>
      <Path d={path} stroke={avatar.feature} strokeWidth={3} strokeLinecap="round" fill="none" />
    </Layer>
  );
}

/** The eyes, `open` times as wide as usual (wider when surprised, narrowed when amused). */
function Eyes({ iris, open }: { iris: AvatarEyes; open: number }) {
  return (
    <Animated.View
      style={[
        FILL,
        {
          transform: [{ scaleY: open }],
          transformOrigin: originAt(EYE_LINE),
          transitionProperty: ['transform'],
          ...EASED,
        },
      ]}
    >
      <Layer>
        {EYES.map((x) => (
          <G key={x}>
            <Ellipse cx={x} cy={EYE_LINE} rx={6} ry={3.7} fill={avatar.eyeWhite} />
            <Circle cx={x} cy={EYE_LINE} r={3.3} fill={avatar.eyes[iris]} />
            <Circle cx={x} cy={EYE_LINE} r={1.6} fill={avatar.feature} />
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
    </Animated.View>
  );
}

const OPEN_VISEME = visemeIndex('open');

/**
 * The mouth: the expression's own at rest, opening with `open` (0–1) while the persona speaks
 * into the shape `viseme` names (an index into `VISEMES`; the open mouth when none is given).
 */
function Mouth({
  rest,
  open,
  viseme,
}: {
  rest: string;
  open?: SharedValue<number>;
  viseme?: SharedValue<number>;
}) {
  const reduced = useReducedMotion();
  const resting = useAnimatedStyle(() => ({
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
      <Animated.View style={[FILL, resting]}>
        <Layer>
          <Path d={rest} stroke={avatar.lip} strokeWidth={3.2} strokeLinecap="round" fill="none" />
        </Layer>
      </Animated.View>
      <Animated.View style={[FILL, { transformOrigin: originAt(LIP_LINE) }, opened]}>
        {SPEECH_VISEMES.map((name) => (
          <SpeechShape key={name} name={name} reduced={reduced} viseme={viseme} open={open} />
        ))}
      </Animated.View>
    </>
  );
}

/** One mouth shape, shown only while the voice is in it. */
function SpeechShape({
  name,
  reduced,
  viseme,
  open,
}: {
  name: Exclude<Viseme, 'closed'>;
  reduced: boolean;
  viseme?: SharedValue<number>;
  open?: SharedValue<number>;
}) {
  const index = visemeIndex(name);
  const shown = useAnimatedStyle(() => {
    // Without shapes to follow, any speech is the open mouth.
    const current = viseme ? viseme.get() : open && open.get() > 0 ? OPEN_VISEME : 0;
    // Reduce Motion: one steady shape, not a mouth that keeps changing.
    const target = reduced && current > 0 ? OPEN_VISEME : current;
    return { opacity: target === index ? 1 : 0 };
  });
  const { shape, teeth } = MOUTHS[name];
  return (
    <Animated.View style={[FILL, shown]}>
      <Layer>
        <Path d={shape} fill={avatar.mouth} />
        {teeth ? <Path d={teeth} fill={avatar.eyeWhite} /> : null}
      </Layer>
    </Animated.View>
  );
}

/** A thumbs-up on the portrait's lower right, popping in when the gesture starts. */
function ThumbsUp({ skin }: { skin: AvatarLook['skin'] }) {
  const tone = avatar.skin[skin];
  return (
    <Pop style={FILL}>
      <Layer>
        <G
          fill={tone.base}
          stroke={avatar.feature}
          strokeWidth={HAND_STROKE}
          strokeLinejoin="round"
        >
          <Path d={THUMB} />
          <Rect {...FIST} />
        </G>
      </Layer>
    </Pop>
  );
}

export function Avatar({
  look,
  size,
  mood = 'idle',
  mouth,
  viseme,
  expression = 'neutral',
  gesture = 'none',
  still = false,
}: {
  look: AvatarLook;
  /** Width and height (pt). */
  size: number;
  mood?: AvatarMood;
  /** How far the mouth is open, 0–1, updated from the live voice level. */
  mouth?: SharedValue<number>;
  /** Which mouth shape the voice is in: an index into `VISEMES` (`lib/lip-sync.ts`). */
  viseme?: SharedValue<number>;
  /** What the face shows. */
  expression?: AvatarExpression;
  /** A teaching gesture on top of the expression. */
  gesture?: AvatarGesture;
  /** A portrait that does not move (small list and card avatars). */
  still?: boolean;
}) {
  const reduced = useReducedMotion();
  const hmm = gesture === 'hmm';
  const pose = hmm ? HMM_POSE : POSE[mood];
  const face = hmm ? HMM_FACE : FACES[expression];
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
            ...EASED,
          },
        ]}
      >
        <Loop keyframes={BREATHE} duration={motion.breathe} alternate play={alive} style={FILL}>
          <View style={FILL}>
            <Portrait look={look} />
          </View>
          <Brows path={face.brows} />
          <Loop
            keyframes={BLINK}
            duration={motion.blink}
            linear
            play={alive}
            style={[FILL, { transformOrigin: originAt(EYE_LINE) }]}
          >
            <Eyes iris={look.eyes ?? 'brown'} open={face.eyes} />
          </Loop>
          <Mouth
            rest={face.mouth}
            open={still ? undefined : mouth}
            viseme={still ? undefined : viseme}
          />
          {gesture === 'thumbsUp' && !still ? <ThumbsUp skin={look.skin} /> : null}
        </Loop>
      </Animated.View>
    </View>
  );
}
