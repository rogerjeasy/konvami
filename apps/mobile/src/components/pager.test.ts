import { recedeStyle, visiblePages } from './pager';

const pages = (mask: number) => [0, 1, 2].filter((i) => mask & (1 << i));

describe('visiblePages', () => {
  it('shows only the current page at rest', () => {
    expect(pages(visiblePages(1, 3))).toEqual([1]);
  });

  it('starts the next page as soon as a swipe towards it begins, in both directions', () => {
    expect(pages(visiblePages(1.02, 3))).toEqual([1, 2]);
    expect(pages(visiblePages(0.98, 3))).toEqual([0, 1]);
  });

  it('lets the previous page go once it has fully left the screen', () => {
    expect(pages(visiblePages(2, 3))).toEqual([2]);
  });
});

describe("recedeStyle (what a page's illustration does while you swipe)", () => {
  const offsets = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];

  it.each([false, true])(
    'never moves sideways, so it cannot reach the next slide (reduced=%s)',
    (reduced) => {
      for (const offset of offsets) {
        const transforms = (recedeStyle(offset, reduced).transform ?? []) as object[];
        expect(transforms.every((t) => !('translateX' in t) && !('translateY' in t))).toBe(true);
      }
    },
  );

  it('only ever shrinks towards its centre, never grows past its margins', () => {
    for (const offset of offsets) {
      const [scale] = (recedeStyle(offset, false).transform ?? [{ scale: 1 }]) as {
        scale: number;
      }[];
      expect(scale!.scale).toBeLessThanOrEqual(1);
    }
  });

  it('is fully shown when its page is current, and dims as it leaves', () => {
    expect(recedeStyle(0, false)).toEqual({ opacity: 1, transform: [{ scale: 1 }] });
    expect(recedeStyle(0.5, false).opacity).toBeLessThan(1);
  });
});
