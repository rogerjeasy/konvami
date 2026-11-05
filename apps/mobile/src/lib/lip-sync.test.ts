import { mouthOpenness, visemeAt, visemeIndex, VISEMES } from './lip-sync';

describe('visemeAt', () => {
  it('closes the mouth in silence', () => {
    expect(visemeAt(0, 5)).toBe('closed');
    expect(visemeAt(0.01, 0)).toBe('closed');
  });

  it('opens widest for a loud voice and narrower for a soft one', () => {
    expect(visemeAt(0.3, 0)).toBe('open');
    expect(['narrow', 'pucker', 'teeth']).toContain(visemeAt(0.04, 0));
  });

  it('holds a shape for a moment and then moves on', () => {
    expect(visemeAt(0.3, 0)).toBe(visemeAt(0.3, 1));
    expect(visemeAt(0.3, 2)).not.toBe(visemeAt(0.3, 0));
  });

  it('names every shape once, with closed first', () => {
    expect(VISEMES[0]).toBe('closed');
    expect(new Set(VISEMES).size).toBe(VISEMES.length);
    expect(visemeIndex('open')).toBe(3);
  });
});

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
