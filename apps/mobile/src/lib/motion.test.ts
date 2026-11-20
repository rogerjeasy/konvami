import { motion } from '@konvami/design-tokens';
import {
  assertValidKeyframes,
  burstKeyframes,
  burstOffset,
  fillKeyframes,
  growKeyframes,
  pct,
  popKeyframes,
  riseKeyframes,
  slideUpKeyframes,
  type Keyframes,
} from './motion';

describe('keyframes', () => {
  it.each([false, true])(
    'every builder uses steps native Reanimated accepts (reduced=%s)',
    (reduced) => {
      for (const keyframes of [
        riseKeyframes(reduced),
        popKeyframes(reduced),
        growKeyframes(40, reduced),
        fillKeyframes(reduced),
        slideUpKeyframes(reduced),
      ]) {
        expect(() => assertValidKeyframes(keyframes)).not.toThrow();
      }
    },
  );

  it('writes steps as percentages', () => {
    expect(pct(60)).toBe('60%');
  });

  it('rejects bare numbers, which work on web but throw on iOS and Android', () => {
    const bad = { 0: { opacity: 0 }, 60: { opacity: 1 } } as unknown as Keyframes;
    expect(() => assertValidKeyframes(bad)).toThrow(/Invalid keyframe step "0"/);
  });

  it('reduced motion keeps only the fade', () => {
    expect(popKeyframes(true)).toEqual({ from: { opacity: 0 }, to: { opacity: 1 } });
  });

  it('fills a bar from its start, and only fades it in with reduced motion', () => {
    expect(fillKeyframes(false)).toEqual({
      from: { transform: [{ scaleX: 0 }] },
      to: { transform: [{ scaleX: 1 }] },
    });
    expect(fillKeyframes(true)).toEqual({ from: { opacity: 0 }, to: { opacity: 1 } });
  });
});

describe('a celebration burst', () => {
  it('spreads its pieces around the middle, some nearer than others', () => {
    const pieces = Array.from({ length: 8 }, (_, i) => burstOffset(i, 8));
    expect(pieces[0]).toEqual({ x: motion.burstReach, y: 0 });
    const distances = pieces.map(({ x, y }) => Math.round(Math.hypot(x, y)));
    expect(Math.max(...distances)).toBe(motion.burstReach);
    expect(Math.min(...distances)).toBeLessThan(motion.burstReach);
  });

  it('flies out and fades, and with reduced motion only fades where it lands', () => {
    const full = burstKeyframes(40, -20, false);
    const reduced = burstKeyframes(40, -20, true);
    assertValidKeyframes(full);
    assertValidKeyframes(reduced);
    expect(full.to).toMatchObject({ opacity: 0 });
    expect(JSON.stringify(reduced)).not.toContain('rotate');
    expect(reduced.from).toEqual({
      opacity: 0,
      transform: [{ translateX: 40 }, { translateY: -20 }],
    });
  });
});
