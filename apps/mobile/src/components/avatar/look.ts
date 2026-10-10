import type {
  AvatarBackdrop,
  AvatarHairColor,
  AvatarSkin,
  AvatarTop,
} from '@konvami/design-tokens';

/** Hair shapes the portrait can draw. */
export const HAIR_STYLES = ['short', 'parted', 'bob', 'long', 'bun', 'curls', 'bald'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

/**
 * A persona's look (spec §6.20: "a small JSON config of part IDs and colours"). It names parts
 * and palette entries only, so the same config can drive another renderer later (Rive, 3D).
 */
export interface AvatarLook {
  skin: AvatarSkin;
  hair: HairStyle;
  hairColor: AvatarHairColor;
  top: AvatarTop;
  backdrop: AvatarBackdrop;
  glasses?: boolean;
  beard?: boolean;
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
