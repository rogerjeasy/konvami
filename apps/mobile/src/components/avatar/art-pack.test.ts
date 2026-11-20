import { avatar } from '@konvami/design-tokens';
import { VISEMES } from '@/lib/lip-sync';
import {
  knownKeys,
  packCovers,
  portraitLayers,
  resolveLayer,
  MOVING_SLOTS,
  type ArtPack,
  type FaceKey,
} from './art-pack';
import type { SpeechViseme } from './drawing';
import { EXPRESSIONS, FACE_SHAPES, HAIR_STYLES, type AvatarLook } from './look';
import { ART_PACKS, chosenArtPack } from './packs';
import { SAMPLE_PACK } from './sample-pack';

const FACES: FaceKey[] = [...EXPRESSIONS, 'hmm'];
const SPEECH = VISEMES.filter((v): v is SpeechViseme => v !== 'closed');
const KNOWN = knownKeys({
  hair: HAIR_STYLES,
  faces: FACE_SHAPES,
  faceKeys: FACES,
  visemes: SPEECH,
});

const LENA: AvatarLook = {
  skin: 'sand',
  hair: 'long',
  hairColor: 'chestnut',
  top: 'teal',
  backdrop: 'mist',
};

const svg = { svg: '<svg/>' };

describe('the sample art pack', () => {
  it('draws every look the editor can make', () => {
    for (const hair of HAIR_STYLES) {
      for (const face of FACE_SHAPES) {
        const look = { ...LENA, hair, face, glasses: true, beard: true, aged: true };
        expect(packCovers(SAMPLE_PACK, look, FACES, SPEECH)).toBe(true);
      }
    }
  });

  it('names only layers the brief lists', () => {
    expect(Object.keys(SAMPLE_PACK.assets).filter((key) => !KNOWN.has(key))).toEqual([]);
  });

  it('stacks the portrait in the drawing order, tinted with the look', () => {
    const layers = portraitLayers(SAMPLE_PACK, { ...LENA, glasses: true });

    expect(layers.map((layer) => layer.key)).toEqual([
      'backdrop',
      'hair-back.long',
      'top',
      'skin-shade.oval',
      'face.oval',
      'hair-front.long',
      'nose',
      'glasses',
    ]);
    expect(layers[4]?.tint).toBe(avatar.skin.sand.base);
    expect(layers[3]?.tint).toBe(avatar.skin.sand.shade);
    expect(layers[1]?.tint).toBe(avatar.hair.chestnut);
  });

  it('draws tinted layers with the colour the app fills in', () => {
    const face = SAMPLE_PACK.assets['face.oval'];

    expect(face && 'svg' in face && face.svg).toContain('currentColor');
  });
});

describe('every pack in the build', () => {
  it.each(Object.values(ART_PACKS))('$id names only known layers', (pack) => {
    expect(Object.keys(pack.assets).filter((key) => !KNOWN.has(key))).toEqual([]);
  });
});

describe('resolving a layer', () => {
  it('prefers the full-colour picture of the look’s colour, untinted', () => {
    const pack: ArtPack = {
      id: 'p',
      name: 'P',
      assets: { 'face.oval': svg, 'face.oval.sand': svg },
    };

    expect(
      resolveLayer(pack, LENA, { slot: 'face', colour: 'skin', tint: 'skin' }, ['oval']),
    ).toEqual({
      key: 'face.oval.sand',
      asset: svg,
    });
  });

  it('falls back to the tinted picture for other colours', () => {
    const pack: ArtPack = {
      id: 'p',
      name: 'P',
      assets: { 'face.oval': svg, 'face.oval.umber': svg },
    };

    expect(
      resolveLayer(pack, LENA, { slot: 'face', colour: 'skin', tint: 'skin' }, ['oval'])?.key,
    ).toBe('face.oval');
  });

  it('uses brown irises for a look stored before eye colours existed', () => {
    const pack: ArtPack = { id: 'p', name: 'P', assets: { irises: svg } };

    expect(resolveLayer(pack, LENA, MOVING_SLOTS.irises)?.tint).toBe(avatar.eyes.brown);
  });
});

describe('a pack that is not finished', () => {
  const withoutHappyMouth: ArtPack = {
    ...SAMPLE_PACK,
    assets: Object.fromEntries(
      Object.entries(SAMPLE_PACK.assets).filter(([key]) => key !== 'mouth-rest.happy'),
    ),
  };

  it('does not cover a look, so the drawn portrait is shown', () => {
    expect(packCovers(withoutHappyMouth, LENA, FACES, SPEECH)).toBe(false);
  });

  it('needs front hair unless the look is bald', () => {
    const noLongHair: ArtPack = {
      ...SAMPLE_PACK,
      assets: Object.fromEntries(
        Object.entries(SAMPLE_PACK.assets).filter(([key]) => key !== 'hair-front.long'),
      ),
    };

    expect(packCovers(noLongHair, LENA, FACES, SPEECH)).toBe(false);
    expect(packCovers(noLongHair, { ...LENA, hair: 'bald' }, FACES, SPEECH)).toBe(true);
  });
});

describe('choosing the pack', () => {
  it('draws the portrait in code by default and for an unknown id', () => {
    expect(chosenArtPack('')).toBeNull();
    expect(chosenArtPack('konvami-drawn')).toBeNull();
    expect(chosenArtPack('no-such-pack')).toBeNull();
  });

  it('finds the sample pack by its id', () => {
    expect(chosenArtPack('konvami-sample')).toBe(SAMPLE_PACK);
  });
});
