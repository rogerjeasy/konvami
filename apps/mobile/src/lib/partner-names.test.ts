import { partnerNames } from './partner-names';

const labels = { together: (a: string, b: string) => `${a} and ${b}`, former: 'A former partner' };

describe('partnerNames', () => {
  it('names one partner, or both of a two-partner conversation', () => {
    expect(partnerNames({ partner: { name: 'Lena' } }, labels)).toBe('Lena');
    expect(partnerNames({ partner: { name: 'Lena' }, guest: { name: 'Jonas' } }, labels)).toBe(
      'Lena and Jonas',
    );
  });

  it('stands in for a partner who was removed', () => {
    expect(partnerNames({ partner: null, guest: { name: 'Jonas' } }, labels)).toBe(
      'A former partner and Jonas',
    );
    expect(partnerNames({ partner: null, guest: null }, labels)).toBe('A former partner');
  });
});
