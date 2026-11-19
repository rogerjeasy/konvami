import type { ImageSourcePropType } from 'react-native';
import { avatar } from '@konvami/design-tokens';
import type { SpeechViseme } from './drawing';
import type { AvatarExpression, AvatarLook, FaceShape, HairStyle } from './look';

/**
 * Art packs: the avatar's look drawn from layer files instead of code (spec §6.20.3 "the stored
 * look is renderer-neutral"). A persona's look stays a few part names and palette entries; a pack
 * supplies a picture for each part. The artist's brief is `design/avatar-art/BRIEF.md`.
 *
 * Every layer is a square picture on the same design box, stacked in a fixed order (`SLOTS`).
 * A layer's key is its slot, then the part it draws, then optionally its colour:
 *
 *   face.oval          one picture for every skin tone, tinted with the tone
 *   face.oval.umber    a full-colour picture for one tone (used before the tinted one)
 *
 * A tinted picture is drawn in white (or `currentColor` in an SVG) where the colour goes; the
 * app fills it with the look's palette entry. A full-colour picture is shown as it is. That way
 * an artist can start with tinted flats and paint the tones that need it.
 */

/** A layer's picture: SVG text (drawn with `currentColor` for its tint) or a bitmap. */
export type PackAsset = { svg: string } | { image: ImageSourcePropType };

export interface ArtPack {
  /** The pack's id, as `EXPO_PUBLIC_AVATAR_PACK` names it. */
  id: string;
  name: string;
  /** The layers by key (see above). */
  assets: Readonly<Record<string, PackAsset>>;
}

/** The look's parts a layer can depend on. */
type ShapeDim = 'hair' | 'face';
/** The look's colours a layer can depend on (dropped from the key for a tinted picture). */
type ColourDim = 'skin' | 'hairColor' | 'top' | 'backdrop' | 'eyes';
/** What a tinted picture is filled with. */
export type Tint =
  | 'skin'
  | 'skinShade'
  | 'hair'
  | 'top'
  | 'backdrop'
  | 'eyes'
  | 'feature'
  | 'eyeWhite'
  | 'lip'
  | 'mouth'
  | 'glasses';

interface PortraitSlot {
  slot: string;
  shape?: readonly ShapeDim[];
  colour?: ColourDim;
  tint: Tint;
  /** Drawn only for a look with this part. */
  when?: 'aged' | 'beard' | 'glasses';
  /** A pack without it cannot draw the portrait (hair-front: unless the look is bald). */
  required?: boolean;
}

/** The still portrait, bottom to top. */
export const PORTRAIT_SLOTS: readonly PortraitSlot[] = [
  { slot: 'backdrop', colour: 'backdrop', tint: 'backdrop', required: true },
  { slot: 'hair-back', shape: ['hair'], colour: 'hairColor', tint: 'hair' },
  { slot: 'top', colour: 'top', tint: 'top', required: true },
  { slot: 'skin-shade', shape: ['face'], colour: 'skin', tint: 'skinShade' },
  { slot: 'face', shape: ['face'], colour: 'skin', tint: 'skin', required: true },
  { slot: 'age-lines', shape: ['face'], colour: 'skin', tint: 'skinShade', when: 'aged' },
  { slot: 'beard', colour: 'hairColor', tint: 'hair', when: 'beard' },
  { slot: 'hair-front', shape: ['hair'], colour: 'hairColor', tint: 'hair', required: true },
  { slot: 'nose', colour: 'skin', tint: 'skinShade' },
  { slot: 'glasses', tint: 'glasses', when: 'glasses' },
];

/** The faces' moving parts. Brows and resting mouths come per expression and for "hmm". */
export type FaceKey = AvatarExpression | 'hmm';
export const MOVING_SLOTS = {
  brows: { slot: 'brows', tint: 'feature' },
  mouthRest: { slot: 'mouth-rest', tint: 'lip' },
  eyeWhites: { slot: 'eye-whites', tint: 'eyeWhite' },
  irises: { slot: 'irises', colour: 'eyes', tint: 'eyes' },
  eyeLines: { slot: 'eye-lines', tint: 'feature' },
  mouth: { slot: 'mouth', tint: 'mouth' },
  teeth: { slot: 'teeth', tint: 'eyeWhite' },
  hand: { slot: 'hand', colour: 'skin', tint: 'skin' },
  handLines: { slot: 'hand-lines', tint: 'feature' },
} as const;

/** A layer ready to draw: its picture and, for a tinted one, the colour to fill it with. */
export interface ResolvedLayer {
  key: string;
  asset: PackAsset;
  tint?: string;
}

function colourOf(look: AvatarLook, dim: ColourDim): string {
  switch (dim) {
    case 'skin':
      return look.skin;
    case 'hairColor':
      return look.hairColor;
    case 'top':
      return look.top;
    case 'backdrop':
      return look.backdrop;
    case 'eyes':
      return look.eyes ?? 'brown';
  }
}

function shapeOf(look: AvatarLook, dim: ShapeDim): HairStyle | FaceShape {
  return dim === 'hair' ? look.hair : (look.face ?? 'oval');
}

/** The palette colour a tint means for this look. */
export function tintColour(look: AvatarLook, tint: Tint): string {
  const skin = avatar.skin[look.skin];
  switch (tint) {
    case 'skin':
      return skin.base;
    case 'skinShade':
      return skin.shade;
    case 'hair':
      return avatar.hair[look.hairColor];
    case 'top':
      return avatar.top[look.top];
    case 'backdrop':
      return avatar.backdrop[look.backdrop];
    case 'eyes':
      return avatar.eyes[look.eyes ?? 'brown'];
    case 'feature':
    case 'eyeWhite':
    case 'lip':
    case 'mouth':
    case 'glasses':
      return avatar[tint];
  }
}

/**
 * One layer for a look: the full-colour picture of its colour when the pack has it, otherwise
 * the tinted one, otherwise nothing.
 */
export function resolveLayer(
  pack: ArtPack,
  look: AvatarLook,
  spec: { slot: string; colour?: ColourDim; tint: Tint },
  parts: readonly string[] = [],
): ResolvedLayer | null {
  const base = [spec.slot, ...parts].join('.');
  if (spec.colour) {
    const coloured = `${base}.${colourOf(look, spec.colour)}`;
    const asset = pack.assets[coloured];
    if (asset) return { key: coloured, asset };
  }
  const asset = pack.assets[base];
  return asset ? { key: base, asset, tint: tintColour(look, spec.tint) } : null;
}

const hasPart = (look: AvatarLook, when: PortraitSlot['when']): boolean =>
  when === undefined || look[when] === true;

const partsOf = (look: AvatarLook, slot: PortraitSlot) =>
  (slot.shape ?? []).map((dim) => shapeOf(look, dim));

/** The still portrait's layers for a look, bottom to top. */
export function portraitLayers(pack: ArtPack, look: AvatarLook): ResolvedLayer[] {
  return PORTRAIT_SLOTS.filter((slot) => hasPart(look, slot.when))
    .map((slot) => resolveLayer(pack, look, slot, partsOf(look, slot)))
    .filter((layer): layer is ResolvedLayer => layer !== null);
}

/**
 * Whether a pack can draw this look with every expression and mouth shape. When it cannot, the
 * avatar falls back to the drawn portrait, so a half-finished pack never shows a broken face.
 */
export function packCovers(
  pack: ArtPack,
  look: AvatarLook,
  faces: readonly FaceKey[],
  visemes: readonly SpeechViseme[],
): boolean {
  const portrait = PORTRAIT_SLOTS.filter(
    (slot) => slot.required && !(slot.slot === 'hair-front' && look.hair === 'bald'),
  ).every((slot) => resolveLayer(pack, look, slot, partsOf(look, slot)) !== null);
  const moving =
    resolveLayer(pack, look, MOVING_SLOTS.eyeWhites) !== null &&
    resolveLayer(pack, look, MOVING_SLOTS.irises) !== null &&
    faces.every(
      (face) =>
        resolveLayer(pack, look, MOVING_SLOTS.brows, [face]) !== null &&
        resolveLayer(pack, look, MOVING_SLOTS.mouthRest, [face]) !== null,
    ) &&
    visemes.every((viseme) => resolveLayer(pack, look, MOVING_SLOTS.mouth, [viseme]) !== null);
  return portrait && moving;
}

/**
 * Every key a pack may contain: what the brief lists and the pack check accepts. Anything else
 * in a pack is a misnamed file.
 */
export function knownKeys(options: {
  hair: readonly HairStyle[];
  faces: readonly FaceShape[];
  faceKeys: readonly FaceKey[];
  visemes: readonly SpeechViseme[];
}): Set<string> {
  const colours: Record<ColourDim, readonly string[]> = {
    skin: Object.keys(avatar.skin),
    hairColor: Object.keys(avatar.hair),
    top: Object.keys(avatar.top),
    backdrop: Object.keys(avatar.backdrop),
    eyes: Object.keys(avatar.eyes),
  };
  const keys = new Set<string>();
  const add = (base: string, colour?: ColourDim) => {
    keys.add(base);
    for (const value of colour ? colours[colour] : []) keys.add(`${base}.${value}`);
  };
  for (const slot of PORTRAIT_SLOTS) {
    const shapes = slot.shape?.[0] === 'hair' ? options.hair : slot.shape ? options.faces : [null];
    for (const shape of shapes) add(shape ? `${slot.slot}.${shape}` : slot.slot, slot.colour);
  }
  for (const face of options.faceKeys) {
    add(`${MOVING_SLOTS.brows.slot}.${face}`);
    add(`${MOVING_SLOTS.mouthRest.slot}.${face}`);
  }
  for (const viseme of options.visemes) {
    add(`${MOVING_SLOTS.mouth.slot}.${viseme}`);
    add(`${MOVING_SLOTS.teeth.slot}.${viseme}`);
  }
  add(MOVING_SLOTS.eyeWhites.slot);
  add(MOVING_SLOTS.irises.slot, 'eyes');
  add(MOVING_SLOTS.eyeLines.slot);
  add(MOVING_SLOTS.hand.slot, 'skin');
  add(MOVING_SLOTS.handLines.slot);
  return keys;
}
