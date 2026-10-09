import { size, space } from '@konvami/design-tokens';
import { heroDrawingSize, screenLayout } from './layout';

describe('screenLayout', () => {
  it('stacks on a standard phone with a tall hero', () => {
    const layout = screenLayout({ width: 390, height: 844, fontScale: 1 });
    expect(layout).toMatchObject({ compact: false, split: false, gutter: space['2xl'] });
    expect(layout.heroMinHeight).toBeGreaterThan(400);
    expect(layout.illustrationWidth).toBe(390 - space['2xl'] * 2);
  });

  it('uses tight gutters on a narrow phone and keeps the drawing inside them', () => {
    const layout = screenLayout({ width: 320, height: 568, fontScale: 1 });
    expect(layout.compact).toBe(true);
    expect(layout.gutter).toBe(space.lg);
    expect(layout.illustrationWidth).toBe(320 - space.lg * 2);
    expect(layout.heroMinHeight).toBe(0);
  });

  it('never draws the illustration wider than its maximum', () => {
    expect(screenLayout({ width: 700, height: 1000, fontScale: 1 }).illustrationWidth).toBe(
      size.illustrationMaxWidth,
    );
  });

  it('goes side by side on a landscape tablet and on wide desktop windows', () => {
    expect(screenLayout({ width: 1180, height: 820, fontScale: 1 }).split).toBe(true);
    expect(screenLayout({ width: 1440, height: 1200, fontScale: 1 }).split).toBe(true);
  });

  it('stays stacked on a portrait tablet', () => {
    expect(screenLayout({ width: 820, height: 1180, fontScale: 1 }).split).toBe(false);
  });

  it('drops the fixed hero height and the split at large text sizes so text can grow', () => {
    const layout = screenLayout({ width: 1180, height: 820, fontScale: 2 });
    expect(layout.split).toBe(false);
    expect(layout.heroMinHeight).toBe(0);
  });
});

describe('hero share', () => {
  it('gives the hero the share of a tall window that the screen asks for', () => {
    const metrics = { width: 390, height: 844, fontScale: 1 };
    expect(screenLayout(metrics).heroMinHeight).toBe(Math.round(844 * 0.56));
    expect(screenLayout(metrics, 0.42).heroMinHeight).toBe(Math.round(844 * 0.42));
  });

  it('still lets the hero size to its drawing on short windows and at large text sizes', () => {
    expect(screenLayout({ width: 320, height: 568, fontScale: 1 }, 0.42).heroMinHeight).toBe(0);
    expect(screenLayout({ width: 390, height: 844, fontScale: 1.6 }, 0.42).heroMinHeight).toBe(0);
  });
});

describe('heroDrawingSize', () => {
  it('draws at the frame size when there is room', () => {
    expect(heroDrawingSize({ frame: 288, available: 342, windowHeight: 844 })).toBe(288);
  });

  it('never draws wider than the space between the gutters', () => {
    expect(heroDrawingSize({ frame: 288, available: 250, windowHeight: 844 })).toBe(250);
  });

  it('draws smaller on a short window, so the title below is still on screen', () => {
    const size = heroDrawingSize({ frame: 288, available: 288, windowHeight: 568 });
    expect(size).toBeLessThan(288);
    expect(size).toBe(Math.round(568 * 0.36));
  });
});
