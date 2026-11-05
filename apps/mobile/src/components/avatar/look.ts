import type {
  AvatarBackdrop,
  AvatarEyes,
  AvatarHairColor,
  AvatarSkin,
  AvatarTop,
} from '@konvami/design-tokens';

/** Hair shapes the portrait can draw. */
export const HAIR_STYLES = ['short', 'parted', 'bob', 'long', 'bun', 'curls', 'bald'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

/** Face shapes the portrait can draw (the API's `Face`). */
export const FACE_SHAPES = ['oval', 'round', 'narrow'] as const;
export type FaceShape = (typeof FACE_SHAPES)[number];

/**
 * A persona's look (spec §6.20: "a small JSON config of part IDs and colours"). It names parts
 * and palette entries only, so the same config can drive another renderer later (Rive, 3D).
 * `face`, `eyes` and `aged` came with the avatar editor: a look stored without them draws the
 * original portrait (oval face, brown eyes, no age lines).
 */
export interface AvatarLook {
  skin: AvatarSkin;
  hair: HairStyle;
  hairColor: AvatarHairColor;
  top: AvatarTop;
  backdrop: AvatarBackdrop;
  glasses?: boolean;
  beard?: boolean;
  face?: FaceShape;
  eyes?: AvatarEyes;
  /** Lines around the eyes and mouth. */
  aged?: boolean;
}

/** What the avatar is doing; it moves accordingly. */
export type AvatarMood =
  /** Present, breathing and blinking. */
  | 'idle'
  /** Not there yet: the call is being set up. */
  | 'waiting'
  /** Leaning in while the learner speaks. */
  | 'attentive'
  /** Head tilted while the reply is prepared, which hides the wait in a natural way. */
  | 'thinking'
  /** Talking; the mouth follows the voice. */
  | 'speaking';

/**
 * What the face shows (spec §6.20.1 "Expressions"). The partner picks one with the server's
 * `set_expression` tool; `neutral` is the face at rest. Names match the API's `Expression`.
 */
export const EXPRESSIONS = [
  'neutral',
  'happy',
  'surprised',
  'empathetic',
  'encouraging',
  'confused',
  'amused',
] as const;
export type AvatarExpression = (typeof EXPRESSIONS)[number];

/**
 * A teaching gesture on top of an expression (spec §6.20.1): a thumbs-up for a correct use of
 * what is being practised, a thoughtful "hmm" when a correction comes.
 */
export type AvatarGesture = 'none' | 'hmm' | 'thumbsUp';

export const isExpression = (value: unknown): value is AvatarExpression =>
  EXPRESSIONS.includes(value as AvatarExpression);
