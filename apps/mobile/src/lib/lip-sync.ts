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
