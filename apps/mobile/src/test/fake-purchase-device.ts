import type { PurchaseDevice, PurchaseResult, StoreOffer } from '@/plan/device';

export interface FakePurchaseDevice extends PurchaseDevice {
  /** What the store offers. */
  stock: StoreOffer[];
  /** What a purchase ends as. */
  result: PurchaseResult | 'fails';
  /** What the learner did, in order: `signIn <id>`, `purchase <offer>`, `restore`, `signOut`. */
  log: string[];
  managementUrl: string | null;
}

/** The offers of a store build, as RevenueCat would hand them out (prices are the store's text). */
export const FAKE_OFFERS: StoreOffer[] = [
  {
    id: 'plus/$rc_monthly',
    kind: 'subscription',
    tier: 'plus',
    period: 'month',
    title: 'Konvami Plus',
    price: 'CHF 14.90',
    trialDays: 7,
  },
  {
    id: 'plus/$rc_annual',
    kind: 'subscription',
    tier: 'plus',
    period: 'year',
    title: 'Konvami Plus',
    price: 'CHF 99.00',
    trialDays: null,
  },
  {
    id: 'pro/$rc_monthly',
    kind: 'subscription',
    tier: 'pro',
    period: 'month',
    title: 'Konvami Pro',
    price: 'CHF 29.90',
    trialDays: null,
  },
  {
    id: 'minutes/minutes_60',
    kind: 'pack',
    tier: null,
    period: null,
    title: '60 voice minutes',
    price: 'CHF 7.90',
    trialDays: null,
  },
];

export function createFakePurchaseDevice(available = true): FakePurchaseDevice {
  const device: FakePurchaseDevice = {
    available,
    stock: FAKE_OFFERS,
    result: 'purchased',
    log: [],
    managementUrl: 'https://apps.apple.com/account/subscriptions',
    async signIn(userId) {
      device.log.push(`signIn ${userId}`);
    },
    async signOut() {
      device.log.push('signOut');
    },
    offers: async () => device.stock,
    async purchase(offerId) {
      device.log.push(`purchase ${offerId}`);
      if (device.result === 'fails') throw new Error('the store failed');
      return device.result;
    },
    async restore() {
      device.log.push('restore');
    },
    manageUrl: async () => device.managementUrl,
  };
  return device;
}
