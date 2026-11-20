import { useMemo, type ReactNode } from 'react';
import { Image, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Rect, SvgXml } from 'react-native-svg';
import { avatar, motion, opacity, type AvatarEyes } from '@konvami/design-tokens';
import { Loop, Pop } from '@/components/motion';
import { visemeIndex, VISEMES } from '@/lib/lip-sync';
import { CSS_EASE_OUT, pct, type Keyframes } from '@/lib/motion';
import {
  MOVING_SLOTS,
  packCovers,
  portraitLayers,
  resolveLayer,
  type ArtPack,
  type FaceKey,
  type ResolvedLayer,
} from './art-pack';
import {
  AGE_LINES,
  AGE_LINE_WIDTH,
  BEARD,
  BOX,
  BROW_WIDTH,
  BUN,
  CURLS,
  EARS,
  EYE,
  EYE_LINE,
  EYES,
  FACE,
  FACES,
  FIST,
  GLASSES,
  HAIR_BEHIND,
  HAIR_ON_TOP,
  HAND_STROKE,
  HMM_FACE,
  LIP_LINE,
  LIP_WIDTH,
  MOUTHS,
  NECK,
  NOSE,
  NOSE_WIDTH,
  SHOULDERS,
  THUMB,
  type SpeechViseme,
} from './drawing';
import {
  EXPRESSIONS,
  type AvatarExpression,
  type AvatarGesture,
  type AvatarLook,
  type AvatarMood,
} from './look';
import { chosenArtPack } from './packs';

/**
 * A persona's portrait, drawn from its look (spec §6.20). It breathes and blinks, tilts its head
 * while a reply is prepared, leans in while the learner speaks, moves its mouth with the voice
 * and shows an expression (brows, eyes and a resting mouth) the partner chooses. Decorative: the
 * screen around it says in words what is happening.
 *
 * The drawing is a stack of layers on one 200 × 200 design box (`drawing.ts`), each scaled with
 * the avatar's size. Brows, eyes and mouth are layers of their own so they can change without
 * redrawing the face. The layers come from the code's drawing, or from an art pack
 * (`art-pack.ts`) when the build names one that can draw this look; the motion is the same.
 */

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

const SPEECH_VISEMES = VISEMES.filter((v): v is SpeechViseme => v !== 'closed');
// Every face a pack must draw: the expressions and the "hmm" of a correction.
const FACE_KEYS: readonly FaceKey[] = [...EXPRESSIONS, 'hmm'];

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

/** One layer of an art pack, filling the design box; a tinted one takes the look's colour. */
function PackLayer({ layer }: { layer: ResolvedLayer }) {
  const { asset, tint } = layer;
  return (
    <View style={FILL}>
      {'svg' in asset ? (
        <SvgXml xml={asset.svg} width="100%" height="100%" color={tint} />
      ) : (
        <Image
          source={asset.image}
          resizeMode="contain"
          style={{ width: '100%', height: '100%', tintColor: tint }}
        />
      )}
    </View>
  );
}

/** Several pack layers, bottom to top. */
function PackStack({ layers }: { layers: readonly (ResolvedLayer | null)[] }) {
  return <>{layers.map((layer) => (layer ? <PackLayer key={layer.key} layer={layer} /> : null))}</>;
}

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
        {EARS.map(([cx, cy, rx, ry]) => (
          <Ellipse key={cx} cx={cx} cy={cy} rx={rx} ry={ry} fill={skin.shade} />
        ))}
        <Path d={FACE[look.face ?? 'oval']} fill={skin.base} />
        {look.aged ? (
          <Path
            d={AGE_LINES}
            stroke={skin.shade}
            strokeWidth={AGE_LINE_WIDTH}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
        {look.beard ? <Path d={BEARD} fill={hair} /> : null}
        {look.hair === 'bun' ? <Circle cx={BUN[0]} cy={BUN[1]} r={BUN[2]} fill={hair} /> : null}
        {look.hair === 'curls'
          ? CURLS.map(([cx, cy, r]) => (
              <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={hair} />
            ))
          : null}
        {onTop ? <Path d={onTop} fill={hair} /> : null}
        <Path
          d={NOSE}
          stroke={skin.shade}
          strokeWidth={NOSE_WIDTH}
          strokeLinecap="round"
          fill="none"
        />
        {look.glasses ? (
          <G stroke={avatar.glasses} strokeWidth={GLASSES.width} fill="none">
            {GLASSES.frames.map((frame) => (
              <Rect key={frame.x} {...frame} />
            ))}
            <Path d={GLASSES.bridge} />
          </G>
        ) : null}
      </G>
    </Layer>
  );
}

function Brows({ path }: { path: string }) {
  return (
    <Layer>
      <Path
        d={path}
        stroke={avatar.feature}
        strokeWidth={BROW_WIDTH}
        strokeLinecap="round"
        fill="none"
      />
    </Layer>
  );
}

function DrawnEyes({ iris }: { iris: AvatarEyes }) {
  return (
    <Layer>
      {EYES.map((x) => (
        <G key={x}>
          <Ellipse
            cx={x}
            cy={EYE_LINE}
            rx={EYE.white.rx}
            ry={EYE.white.ry}
            fill={avatar.eyeWhite}
          />
          <Circle cx={x} cy={EYE_LINE} r={EYE.iris} fill={avatar.eyes[iris]} />
          <Circle cx={x} cy={EYE_LINE} r={EYE.pupil} fill={avatar.feature} />
          {/* The upper lid, which is what makes an eye look relaxed instead of startled. */}
          <Path
            d={EYE.lid(x)}
            stroke={avatar.feature}
            strokeWidth={EYE.lidWidth}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      ))}
    </Layer>
  );
}

/** The eyes, `open` times as wide as usual (wider when surprised, narrowed when amused). */
function Eyes({ open, children }: { open: number; children: ReactNode }) {
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
      {children}
    </Animated.View>
  );
}

const OPEN_VISEME = visemeIndex('open');

/**
 * The mouth: `rest` (the expression's own) at rest, opening with `open` (0–1) while the persona
 * speaks into the shape `viseme` names (an index into `VISEMES`; the open mouth when none is
 * given). `shape` draws each speaking shape.
 */
function Mouth({
  rest,
  shape,
  open,
  viseme,
}: {
  rest: ReactNode;
  shape: (name: SpeechViseme) => ReactNode;
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
      <Animated.View style={[FILL, resting]}>{rest}</Animated.View>
      <Animated.View style={[FILL, { transformOrigin: originAt(LIP_LINE) }, opened]}>
        {SPEECH_VISEMES.map((name) => (
          <SpeechShape key={name} name={name} reduced={reduced} viseme={viseme} open={open}>
            {shape(name)}
          </SpeechShape>
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
  children,
}: {
  name: SpeechViseme;
  reduced: boolean;
  viseme?: SharedValue<number>;
  open?: SharedValue<number>;
  children: ReactNode;
}) {
  const index = visemeIndex(name);
  const shown = useAnimatedStyle(() => {
    // Without shapes to follow, any speech is the open mouth.
    const current = viseme ? viseme.get() : open && open.get() > 0 ? OPEN_VISEME : 0;
    // Reduce Motion: one steady shape, not a mouth that keeps changing.
    const target = reduced && current > 0 ? OPEN_VISEME : current;
    return { opacity: target === index ? 1 : 0 };
  });
  return <Animated.View style={[FILL, shown]}>{children}</Animated.View>;
}

function DrawnRest({ path }: { path: string }) {
  return (
    <Layer>
      <Path
        d={path}
        stroke={avatar.lip}
        strokeWidth={LIP_WIDTH}
        strokeLinecap="round"
        fill="none"
      />
    </Layer>
  );
}

function DrawnSpeech({ name }: { name: SpeechViseme }) {
  const { shape, teeth } = MOUTHS[name];
  return (
    <Layer>
      <Path d={shape} fill={avatar.mouth} />
      {teeth ? <Path d={teeth} fill={avatar.eyeWhite} /> : null}
    </Layer>
  );
}

function DrawnHand({ skin }: { skin: AvatarLook['skin'] }) {
  const tone = avatar.skin[skin];
  return (
    <Layer>
      <G fill={tone.base} stroke={avatar.feature} strokeWidth={HAND_STROKE} strokeLinejoin="round">
        <Path d={THUMB} />
        <Rect {...FIST} />
      </G>
    </Layer>
  );
}

/** A thumbs-up on the portrait's lower right, popping in when the gesture starts. */
function ThumbsUp({ children }: { children: ReactNode }) {
  return <Pop style={FILL}>{children}</Pop>;
}

/** The layers of one look, from the code's drawing or from an art pack. */
interface Painter {
  portrait: ReactNode;
  brows: (face: FaceKey) => ReactNode;
  eyes: ReactNode;
  rest: (face: FaceKey) => ReactNode;
  speech: (name: SpeechViseme) => ReactNode;
  hand: ReactNode;
}

const faceState = (face: FaceKey) => (face === 'hmm' ? HMM_FACE : FACES[face]);

function drawnPainter(look: AvatarLook): Painter {
  return {
    portrait: <Portrait look={look} />,
    brows: (face) => <Brows path={faceState(face).brows} />,
    eyes: <DrawnEyes iris={look.eyes ?? 'brown'} />,
    rest: (face) => <DrawnRest path={faceState(face).mouth} />,
    speech: (name) => <DrawnSpeech name={name} />,
    hand: <DrawnHand skin={look.skin} />,
  };
}

function packPainter(pack: ArtPack, look: AvatarLook): Painter {
  const layer = (spec: Parameters<typeof resolveLayer>[2], parts: string[] = []) =>
    resolveLayer(pack, look, spec, parts);
  const hand = layer(MOVING_SLOTS.hand);
  return {
    portrait: <PackStack layers={portraitLayers(pack, look)} />,
    brows: (face) => <PackStack layers={[layer(MOVING_SLOTS.brows, [face])]} />,
    eyes: (
      <PackStack
        layers={[
          layer(MOVING_SLOTS.eyeWhites),
          layer(MOVING_SLOTS.irises),
          layer(MOVING_SLOTS.eyeLines),
        ]}
      />
    ),
    rest: (face) => <PackStack layers={[layer(MOVING_SLOTS.mouthRest, [face])]} />,
    speech: (name) => (
      <PackStack layers={[layer(MOVING_SLOTS.mouth, [name]), layer(MOVING_SLOTS.teeth, [name])]} />
    ),
    // A pack without a hand shows the drawn one: the gesture is feedback, not decoration.
    hand: hand ? (
      <PackStack layers={[hand, layer(MOVING_SLOTS.handLines)]} />
    ) : (
      <DrawnHand skin={look.skin} />
    ),
  };
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
  pack,
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
  /** The art pack to draw with; the build's pack when left out, null for the drawn portrait. */
  pack?: ArtPack | null;
}) {
  const reduced = useReducedMotion();
  const art = pack === undefined ? chosenArtPack() : pack;
  // A pack that cannot draw every part of this look gives way to the drawn portrait.
  const painter = useMemo(
    () =>
      art && packCovers(art, look, FACE_KEYS, SPEECH_VISEMES)
        ? packPainter(art, look)
        : drawnPainter(look),
    [art, look],
  );
  const hmm = gesture === 'hmm';
  const pose = hmm ? HMM_POSE : POSE[mood];
  const face: FaceKey = hmm ? 'hmm' : expression;
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
          <View style={FILL}>{painter.portrait}</View>
          <View style={FILL}>{painter.brows(face)}</View>
          <Loop
            keyframes={BLINK}
            duration={motion.blink}
            linear
            play={alive}
            style={[FILL, { transformOrigin: originAt(EYE_LINE) }]}
          >
            <Eyes open={faceState(face).eyes}>{painter.eyes}</Eyes>
          </Loop>
          <Mouth
            rest={painter.rest(face)}
            shape={painter.speech}
            open={still ? undefined : mouth}
            viseme={still ? undefined : viseme}
          />
          {gesture === 'thumbsUp' && !still ? <ThumbsUp>{painter.hand}</ThumbsUp> : null}
        </Loop>
      </Animated.View>
    </View>
  );
}
