import type { Viseme } from '@/lib/lip-sync';
import type { AvatarExpression, FaceShape, HairStyle } from './look';

/**
 * The geometry of Konvami's drawn portrait (the "konvami-drawn" art pack): every path on one
 * 200 × 200 design box. The drawn renderer (`avatar.tsx`) draws it with react-native-svg, and the
 * sample art pack (`sample-pack.ts`) serialises the same shapes into layer files, so both show
 * the same face.
 */

// The design box every layer is drawn on.
export const BOX = 200;
// Where the eyes and the mouth sit in the box (the points their movement turns around).
export const EYE_LINE = 96;
export const LIP_LINE = 116;
export const EYES = [86, 114] as const;

// Hair drawn behind the head and shoulders (the length of longer styles).
export const HAIR_BEHIND: Partial<Record<HairStyle, string>> = {
  bob: 'M56 96 C50 44 150 44 144 96 L146 132 C140 140 130 138 128 130 L128 96 L72 96 L72 130 C70 138 60 140 54 132 Z',
  long: 'M56 96 C50 44 150 44 144 96 L150 172 C142 182 130 180 128 170 L128 96 L72 96 L72 170 C70 180 58 182 50 172 Z',
};
// Hair drawn over the top of the head (the hairline).
const CAP =
  'M62 92 C58 54 80 38 100 38 C120 38 142 54 138 92 C134 74 124 62 100 60 C78 62 66 74 62 92 Z';
export const HAIR_ON_TOP: Partial<Record<HairStyle, string>> = {
  short: CAP,
  bob: CAP,
  long: CAP,
  bun: CAP,
  curls: CAP,
  parted:
    'M62 94 C56 52 84 36 104 38 C126 40 144 58 138 94 C134 78 128 68 116 64 C100 72 78 70 66 80 Z',
};
// The bun of the `bun` style: [x, y, radius].
export const BUN = [100, 34, 15] as const;
// The curls of the `curls` style, as circles around the crown: [x, y, radius].
export const CURLS = [
  [72, 62, 16],
  [88, 48, 17],
  [108, 46, 17],
  [126, 58, 16],
  [62, 82, 13],
  [138, 80, 13],
] as const;

// The face, one outline per shape; the oval is the original portrait.
export const FACE: Record<FaceShape, string> = {
  oval: 'M64 88 C64 58 82 46 100 46 C118 46 136 58 136 88 C136 112 124 136 100 138 C76 136 64 112 64 88 Z',
  round:
    'M62 88 C62 56 80 45 100 45 C120 45 138 56 138 88 C138 114 124 138 100 139 C76 138 62 114 62 88 Z',
  narrow:
    'M67 88 C67 58 83 46 100 46 C117 46 133 58 133 88 C133 114 121 138 100 140 C79 138 67 114 67 88 Z',
};
// The ears, either side of the face: [x, y, x radius, y radius].
export const EARS = [
  [63, 98, 5.5, 9],
  [137, 98, 5.5, 9],
] as const;
export const BEARD =
  'M66 100 C68 128 82 142 100 142 C118 142 132 128 134 100 C128 118 116 126 100 126 C84 126 72 118 66 100 Z';
export const SHOULDERS = 'M24 200 C24 168 52 152 86 148 L114 148 C148 152 176 168 176 200 Z';
export const NECK = 'M86 118 L86 150 Q100 160 114 150 L114 118 Z';
// Age lines: forehead, the corners of the eyes, and the folds from the nose to the mouth.
export const AGE_LINES =
  'M82 68 Q100 64 118 68 M72 98 L67 101 M72 102 L68 106 M128 98 L133 101 M128 102 L132 106 M88 122 Q84 130 87 137 M112 122 Q116 130 113 137';
export const AGE_LINE_WIDTH = 1.8;
export const NOSE = 'M99 101 Q97 109 101 111';
export const NOSE_WIDTH = 2;
// The glasses: two rounded frames and the bridge.
export const GLASSES = {
  frames: [
    { x: 72, y: 86, width: 24, height: 19, rx: 7 },
    { x: 104, y: 86, width: 24, height: 19, rx: 7 },
  ],
  bridge: 'M96 94 Q100 91 104 94',
  width: 2.5,
} as const;

// What the face shows for each expression: the brows, the mouth at rest, and how far the eyes
// are open (1 is the usual; above is wider, below is narrowed).
export interface FaceState {
  brows: string;
  mouth: string;
  eyes: number;
}
export const FACES: Record<AvatarExpression, FaceState> = {
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
export const HMM_FACE: FaceState = {
  brows: 'M78 86 Q86 83 94 86 M106 86 Q114 83 122 86',
  mouth: 'M92 118 Q100 117 108 119',
  eyes: 0.9,
};
export const BROW_WIDTH = 3;
export const LIP_WIDTH = 3.2;

// One eye at `x`: the white, the iris, the pupil and the upper lid (which is what makes an eye
// look relaxed instead of startled).
export const EYE = {
  white: { rx: 6, ry: 3.7 },
  iris: 3.3,
  pupil: 1.6,
  lid: (x: number) =>
    `M${x - 6.5} ${EYE_LINE - 1} Q${x} ${EYE_LINE - 6} ${x + 6.5} ${EYE_LINE - 1}`,
  lidWidth: 1.8,
} as const;

/** The mouth shapes of the voice (see `lib/lip-sync.ts`) other than closed. */
export type SpeechViseme = Exclude<Viseme, 'closed'>;
// Each mouth shape, with the teeth it shows, if any.
export const MOUTHS: Record<SpeechViseme, { shape: string; teeth?: string }> = {
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

// The thumbs-up of a gesture, on the lower right of the portrait (inside the round frame).
export const THUMB = 'M134 146 L134 134 Q134 127 140 127 Q145 127 145 134 L145 146';
export const FIST = { x: 130, y: 146, width: 26, height: 22, rx: 6 } as const;
export const HAND_STROKE = 1.8;
