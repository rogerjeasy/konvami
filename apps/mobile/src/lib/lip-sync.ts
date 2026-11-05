/**
 * How far an avatar's mouth opens for a voice level (spec §6.20: amplitude lip-sync in the MVP).
 * WebRTC reports levels from 0 to 1, where normal speech sits around 0.05–0.25.
 */

// Below this the reading is room noise, not a voice.
const NOISE_FLOOR = 0.02;
// A level at which the mouth is fully open.
const FULL_VOICE = 0.25;

/** 0 (closed) to 1 (fully open). */
export function mouthOpenness(level: number): number {
  if (!(level > NOISE_FLOOR)) return 0;
  return Math.min((level - NOISE_FLOOR) / (FULL_VOICE - NOISE_FLOOR), 1);
}

/**
 * Mouth shapes (visemes, spec §6.20.2 P1). The app gets only the persona's voice level from the
 * WebRTC stack, not its audio samples, so a shape cannot be read from the sounds. It is chosen
 * from how loud the voice is (soft speech narrows or rounds the lips, loud speech opens wide) and
 * varied from tick to tick the way syllables vary. Convincing at a glance, not phoneme-accurate;
 * true visemes need the samples (a native module, or audio over a WebSocket, spec §6.20.3).
 */
export const VISEMES = ['closed', 'narrow', 'mid', 'open', 'round', 'pucker', 'teeth'] as const;
export type Viseme = (typeof VISEMES)[number];

/** Index of a viseme in `VISEMES`, which is what the avatar's shared value carries. */
export const visemeIndex = (viseme: Viseme): number => VISEMES.indexOf(viseme);

// Shapes that suit soft, medium and loud speech; the poll picks one in turn.
const SOFT: readonly Viseme[] = ['narrow', 'pucker', 'teeth'];
const MEDIUM: readonly Viseme[] = ['mid', 'round', 'narrow'];
const LOUD: readonly Viseme[] = ['open', 'mid', 'round'];
// Openness (0–1) where soft speech turns medium and medium turns loud.
const MEDIUM_FROM = 0.34;
const LOUD_FROM = 0.67;
// A shape is held for this many polls of the level, about one short syllable.
const HOLD_TICKS = 2;

/** The mouth shape for a voice `level` at poll number `tick`. */
export function visemeAt(level: number, tick: number): Viseme {
  const open = mouthOpenness(level);
  if (open === 0) return 'closed';
  const shapes = open < MEDIUM_FROM ? SOFT : open < LOUD_FROM ? MEDIUM : LOUD;
  return shapes[Math.floor(tick / HOLD_TICKS) % shapes.length] ?? 'mid';
}
