import { mouthOpenness } from '@/lib/lip-sync';
import { previewLevel } from './use-preview-speech';

describe('previewLevel', () => {
  it('stands for a voice that pauses between words', () => {
    const levels = Array.from({ length: 32 }, (_, tick) => previewLevel(tick));

    expect(levels.some((level) => mouthOpenness(level) === 0)).toBe(true);
    expect(levels.some((level) => mouthOpenness(level) === 1)).toBe(true);
  });

  it('repeats, so the preview can run as long as it is watched', () => {
    expect(previewLevel(3)).toBe(previewLevel(3 + 16));
  });
});
