import type { ArtPack, PackAsset } from './art-pack';
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
  LIP_WIDTH,
  MOUTHS,
  NECK,
  NOSE,
  NOSE_WIDTH,
  SHOULDERS,
  THUMB,
  type FaceState,
  type SpeechViseme,
} from './drawing';
import { EXPRESSIONS, FACE_SHAPES, HAIR_STYLES } from './look';

/**
 * The sample art pack: Konvami's drawn portrait cut into the layers an artist delivers (see
 * `design/avatar-art/BRIEF.md`), every one tinted. It proves the pack loader draws the same face
 * as the code, and shows an artist what each layer holds. Pick it with
 * `EXPO_PUBLIC_AVATAR_PACK=konvami-sample`.
 */

const svg = (body: string): PackAsset => ({
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">${body}</svg>`,
});
const fill = (d: string) => `<path d="${d}" fill="currentColor"/>`;
const line = (d: string, width: number) =>
  `<path d="${d}" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" fill="none"/>`;
const circle = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor"/>`;
const ellipse = ([cx, cy, rx, ry]: readonly [number, number, number, number]) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="currentColor"/>`;
const rect = (r: { x: number; y: number; width: number; height: number; rx: number }) =>
  `x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}"`;

function build(): Record<string, PackAsset> {
  const assets: Record<string, PackAsset> = {
    backdrop: svg(circle(BOX / 2, BOX / 2, BOX / 2)),
    top: svg(fill(SHOULDERS)),
    beard: svg(fill(BEARD)),
    nose: svg(line(NOSE, NOSE_WIDTH)),
    glasses: svg(
      `<g stroke="currentColor" stroke-width="${GLASSES.width}" fill="none">` +
        GLASSES.frames.map((frame) => `<rect ${rect(frame)}/>`).join('') +
        `<path d="${GLASSES.bridge}"/></g>`,
    ),
    'eye-whites': svg(EYES.map((x) => ellipse([x, EYE_LINE, EYE.white.rx, EYE.white.ry])).join('')),
    irises: svg(EYES.map((x) => circle(x, EYE_LINE, EYE.iris)).join('')),
    'eye-lines': svg(
      EYES.map((x) => circle(x, EYE_LINE, EYE.pupil) + line(EYE.lid(x), EYE.lidWidth)).join(''),
    ),
    hand: svg(fill(THUMB) + `<rect ${rect(FIST)} fill="currentColor"/>`),
    'hand-lines': svg(
      `<g stroke="currentColor" stroke-width="${HAND_STROKE}" stroke-linejoin="round" fill="none">` +
        `<path d="${THUMB}"/><rect ${rect(FIST)}/></g>`,
    ),
  };
  for (const hair of HAIR_STYLES) {
    const behind = HAIR_BEHIND[hair];
    if (behind) assets[`hair-back.${hair}`] = svg(fill(behind));
    const onTop = HAIR_ON_TOP[hair];
    const extra =
      hair === 'bun'
        ? circle(...BUN)
        : hair === 'curls'
          ? CURLS.map(([cx, cy, r]) => circle(cx, cy, r)).join('')
          : '';
    if (onTop) assets[`hair-front.${hair}`] = svg(extra + fill(onTop));
  }
  for (const face of FACE_SHAPES) {
    assets[`skin-shade.${face}`] = svg(fill(NECK) + EARS.map(ellipse).join(''));
    assets[`face.${face}`] = svg(fill(FACE[face]));
    assets[`age-lines.${face}`] = svg(line(AGE_LINES, AGE_LINE_WIDTH));
  }
  const faces: [string, FaceState][] = [
    ...EXPRESSIONS.map((name): [string, FaceState] => [name, FACES[name]]),
    ['hmm', HMM_FACE],
  ];
  for (const [name, state] of faces) {
    assets[`brows.${name}`] = svg(line(state.brows, BROW_WIDTH));
    assets[`mouth-rest.${name}`] = svg(line(state.mouth, LIP_WIDTH));
  }
  for (const [name, { shape, teeth }] of Object.entries(MOUTHS) as [
    SpeechViseme,
    (typeof MOUTHS)[SpeechViseme],
  ][]) {
    assets[`mouth.${name}`] = svg(fill(shape));
    if (teeth) assets[`teeth.${name}`] = svg(fill(teeth));
  }
  return assets;
}

export const SAMPLE_PACK: ArtPack = {
  id: 'konvami-sample',
  name: 'Konvami sample (the drawn portrait as layers)',
  assets: build(),
};
