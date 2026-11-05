import { IMPORT_PHOTO_SIDE, shrinkTo } from './photos';

describe('shrinkTo', () => {
  it('leaves a picture that is small enough', () => {
    expect(shrinkTo(IMPORT_PHOTO_SIDE, 900)).toBeNull();
    expect(shrinkTo(800, 1200)).toBeNull();
  });

  it('fits the longest side, wide or tall', () => {
    expect(shrinkTo(4032, 3024)).toEqual({ width: IMPORT_PHOTO_SIDE });
    expect(shrinkTo(3024, 4032)).toEqual({ height: IMPORT_PHOTO_SIDE });
    expect(shrinkTo(3000, 3000)).toEqual({ width: IMPORT_PHOTO_SIDE });
  });
});
