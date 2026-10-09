import {
  assertValidKeyframes,
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
});
