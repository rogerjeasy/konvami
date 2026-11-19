import { pick } from './pick';

describe('picking two partners (5.24)', () => {
  it('adds in the order picked and unpicks on a second tap', () => {
    expect(pick([], 'lena')).toEqual(['lena']);
    expect(pick(['lena'], 'jonas')).toEqual(['lena', 'jonas']);
    expect(pick(['lena', 'jonas'], 'lena')).toEqual(['jonas']);
  });

  it('replaces the second partner when two are picked already', () => {
    expect(pick(['lena', 'jonas'], 'weber')).toEqual(['lena', 'weber']);
  });
});
