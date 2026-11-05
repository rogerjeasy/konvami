import { useEffect } from 'react';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { motion } from '@konvami/design-tokens';
import { mouthOpenness, visemeAt, visemeIndex } from '@/lib/lip-sync';

// The pace of the stand-in voice: the same as the live call's reading of the levels (ms).
const PREVIEW_INTERVAL_MS = 100;
// A stand-in voice level for each poll, looping: words, small pauses and a longer breath. They
// stand for a voice, so the portrait can be seen speaking before there is a call to hear.
const PREVIEW_LEVELS = [
  0.04, 0.14, 0.26, 0.1, 0.0, 0.18, 0.3, 0.12, 0.06, 0.0, 0.0, 0.2, 0.28, 0.08, 0.16, 0.0,
] as const;

/** The stand-in voice level at poll number `tick`. */
export const previewLevel = (tick: number): number =>
  PREVIEW_LEVELS[tick % PREVIEW_LEVELS.length] ?? 0;

/**
 * Drives an avatar's mouth with a stand-in voice while `speaking` is true, as a live call does
 * with the real one (see `useVoiceCall`): `mouth` is how far it is open, `viseme` its shape.
 */
export function usePreviewSpeech(speaking: boolean) {
  const mouth = useSharedValue(0);
  const viseme = useSharedValue(0);
  useEffect(() => {
    if (!speaking) return;
    let tick = 0;
    const timer = setInterval(() => {
      const level = previewLevel(tick);
      mouth.set(withTiming(mouthOpenness(level), { duration: motion.lipSync }));
      viseme.set(visemeIndex(visemeAt(level, tick)));
      tick += 1;
    }, PREVIEW_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      mouth.set(0);
      viseme.set(0);
    };
  }, [speaking, mouth, viseme]);
  return { mouth, viseme };
}
