/**
 * What the app needs from the store's purchases (spec §6.21.2), behind an interface: the phone
 * implements it with RevenueCat (`app-device.ts`), the web preview and Expo Go with nothing
 * (`app-device.web.ts`, and `available: false`), and tests with a stand-in.
 *
 * The store, not the app, says what things cost: prices arrive as the store's own text in the
 * learner's currency, and a free trial as the store's introductory offer.
 *
 * RevenueCat convention the app relies on (docs/superpowers/specs/2026-11-06-subscriptions-design.md):
 * one offering per tier, named `plus` and `pro`, holding the monthly (`$rc_monthly`) and yearly
 * (`$rc_annual`) packages; and one offering named `minutes` whose packages are the minute packs.
 */
export type OfferTier = 'plus' | 'pro';

export interface StoreOffer {
  /** `offering/package`, what `purchase` takes. */
  id: string;
  kind: 'subscription' | 'pack';
  /** The tier a subscription gives; null for a pack. */
  tier: OfferTier | null;
  /** How often a subscription renews; null for a pack. */
  period: 'month' | 'year' | null;
  /** The store's name for it ("60 voice minutes"). */
  title: string;
  /** The price as the store writes it, in the learner's currency ("CHF 14.90"). */
  price: string;
  /** Days of free trial the store gives a first-time subscriber; null for none. */
  trialDays: number | null;
}

export type PurchaseResult = 'purchased' | 'cancelled';

export interface PurchaseDevice {
  /** Whether purchases work here (a phone build with the store keys); otherwise nothing below does. */
  available: boolean;
  /** Names the learner to the store, so what they buy is theirs on every device. */
  signIn(userId: string): Promise<void>;
  /** The learner signed out: the next person on this phone must not own their purchases. */
  signOut(): Promise<void>;
  offers(): Promise<StoreOffer[]>;
  /** Rejects when the store fails; `cancelled` when the learner backed out. */
  purchase(offerId: string): Promise<PurchaseResult>;
  /** Asks the store for the learner's earlier purchases (a new phone). */
  restore(): Promise<void>;
  /** Where the store lets the learner change or cancel their subscription; null when unknown. */
  manageUrl(): Promise<string | null>;
}

/** The offering that holds the minute packs. */
export const PACK_OFFERING = 'minutes';

const TIER_OFFERINGS: readonly string[] = ['plus', 'pro'];

// RevenueCat's package types for the two renewals the app sells.
const PERIODS: Record<string, 'month' | 'year'> = { MONTHLY: 'month', ANNUAL: 'year' };

// The store gives an introductory period in units; a trial is shown in days.
const DAYS_PER_UNIT: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/** The part of a RevenueCat package the app reads. */
export interface PackageLike {
  identifier: string;
  packageType: string;
  product: {
    title: string;
    priceString: string;
    introPrice: { price: number; periodUnit: string; periodNumberOfUnits: number } | null;
  };
}

/** A free introductory period as days; null when there is none or it is not free. */
export function trialDaysOf(intro: PackageLike['product']['introPrice']): number | null {
  if (!intro || intro.price !== 0) return null;
  const perUnit = DAYS_PER_UNIT[intro.periodUnit];
  return perUnit ? perUnit * intro.periodNumberOfUnits : null;
}

/** The offer a package of an offering is; null for one the app does not sell. */
export function offerOf(offering: string, pack: PackageLike): StoreOffer | null {
  const id = `${offering}/${pack.identifier}`;
  const { title, priceString, introPrice } = pack.product;
  if (offering === PACK_OFFERING) {
    return {
      id,
      kind: 'pack',
      tier: null,
      period: null,
      title,
      price: priceString,
      trialDays: null,
    };
  }
  const period = PERIODS[pack.packageType];
  if (!TIER_OFFERINGS.includes(offering) || !period) return null;
  return {
    id,
    kind: 'subscription',
    tier: offering as OfferTier,
    period,
    title,
    price: priceString,
    trialDays: trialDaysOf(introPrice),
  };
}

/** Plus, then Pro; monthly before yearly; packs last. */
export function sortOffers(offers: readonly StoreOffer[]): StoreOffer[] {
  const rank = (offer: StoreOffer) =>
    (offer.kind === 'pack' ? 4 : offer.tier === 'plus' ? 0 : 2) + (offer.period === 'year' ? 1 : 0);
  return [...offers].sort((a, b) => rank(a) - rank(b));
}

/** What a build without the store has: nothing can be bought. */
export const UNAVAILABLE_DEVICE: PurchaseDevice = {
  available: false,
  signIn: async () => {},
  signOut: async () => {},
  offers: async () => [],
  purchase: async () => 'cancelled',
  restore: async () => {},
  manageUrl: async () => null,
};
