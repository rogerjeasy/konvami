import { offerOf, sortOffers, trialDaysOf, type PackageLike } from './device';

const pack = (
  identifier: string,
  packageType: string,
  introPrice: PackageLike['product']['introPrice'] = null,
): PackageLike => ({
  identifier,
  packageType,
  product: { title: 'Konvami Plus', priceString: 'CHF 14.90', introPrice },
});

describe('trialDaysOf', () => {
  it('counts a free introductory period in days', () => {
    expect(trialDaysOf({ price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7 })).toBe(7);
    expect(trialDaysOf({ price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1 })).toBe(7);
  });

  it('has no trial for an introductory price that is not free, or none at all', () => {
    expect(trialDaysOf({ price: 1.9, periodUnit: 'MONTH', periodNumberOfUnits: 1 })).toBeNull();
    expect(trialDaysOf(null)).toBeNull();
  });
});

describe('offerOf', () => {
  it('makes a subscription of a tier’s monthly or yearly package, with the store’s price and trial', () => {
    const intro = { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7 };

    expect(offerOf('plus', pack('$rc_monthly', 'MONTHLY', intro))).toEqual({
      id: 'plus/$rc_monthly',
      kind: 'subscription',
      tier: 'plus',
      period: 'month',
      title: 'Konvami Plus',
      price: 'CHF 14.90',
      trialDays: 7,
    });
    expect(offerOf('pro', pack('$rc_annual', 'ANNUAL'))).toMatchObject({
      tier: 'pro',
      period: 'year',
      trialDays: null,
    });
  });

  it('makes a pack of anything in the minutes offering', () => {
    expect(offerOf('minutes', pack('minutes_60', 'CUSTOM'))).toMatchObject({
      kind: 'pack',
      tier: null,
      period: null,
    });
  });

  it('sells nothing the app does not know: another offering, or an unusual period', () => {
    expect(offerOf('legacy', pack('$rc_monthly', 'MONTHLY'))).toBeNull();
    expect(offerOf('plus', pack('$rc_weekly', 'WEEKLY'))).toBeNull();
  });
});

describe('sortOffers', () => {
  it('puts Plus before Pro, monthly before yearly and packs last', () => {
    const ids = sortOffers(
      [
        offerOf('minutes', pack('minutes_60', 'CUSTOM')),
        offerOf('pro', pack('$rc_annual', 'ANNUAL')),
        offerOf('plus', pack('$rc_annual', 'ANNUAL')),
        offerOf('pro', pack('$rc_monthly', 'MONTHLY')),
        offerOf('plus', pack('$rc_monthly', 'MONTHLY')),
      ].flatMap((offer) => (offer ? [offer] : [])),
    ).map((offer) => offer.id);

    expect(ids).toEqual([
      'plus/$rc_monthly',
      'plus/$rc_annual',
      'pro/$rc_monthly',
      'pro/$rc_annual',
      'minutes/minutes_60',
    ]);
  });
});
