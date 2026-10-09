import { mouthOpenness } from './lip-sync';

describe('mouthOpenness', () => {
  it('keeps the mouth closed in silence and in room noise', () => {
    expect(mouthOpenness(0)).toBe(0);
    expect(mouthOpenness(0.01)).toBe(0);
  });

  it('opens further the louder the voice is', () => {
    const quiet = mouthOpenness(0.05);
    const normal = mouthOpenness(0.12);

    expect(quiet).toBeGreaterThan(0);
    expect(normal).toBeGreaterThan(quiet);
  });

  it('is fully open for a loud voice and never more', () => {
    expect(mouthOpenness(0.3)).toBe(1);
    expect(mouthOpenness(1)).toBe(1);
  });

  it('treats a reading that is not a level as silence', () => {
    expect(mouthOpenness(Number.NaN)).toBe(0);
    expect(mouthOpenness(-0.2)).toBe(0);
  });
});
