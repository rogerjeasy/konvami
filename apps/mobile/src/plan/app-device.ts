import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import {
  offerOf,
  sortOffers,
  UNAVAILABLE_DEVICE,
  type PurchaseDevice,
  type StoreOffer,
} from './device';

// RevenueCat's public SDK keys, one per store. They are public by design (they ship in every
// app); the secret keys and the webhook secret never leave the server.
const KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
} as const;

const key = Platform.OS === 'ios' ? KEYS.ios : Platform.OS === 'android' ? KEYS.android : undefined;

// The packages by offer id, from the last time offers were read: `purchase` takes an id.
let packages = new Map<string, PurchasesPackage>();
let configured = false;

function configure() {
  if (configured || !key) return;
  Purchases.configure({ apiKey: key });
  configured = true;
}

/**
 * Purchases on a phone, with RevenueCat. Without the store key for this platform (a build made
 * before the store accounts exist, Expo Go) nothing can be bought and the app says so.
 */
export const appPurchaseDevice: PurchaseDevice = key
  ? {
      available: true,
      async signIn(userId) {
        configure();
        await Purchases.logIn(userId);
      },
      async signOut() {
        if (configured) await Purchases.logOut().catch(() => {});
      },
      async offers() {
        configure();
        const { all } = await Purchases.getOfferings();
        packages = new Map();
        const found: StoreOffer[] = [];
        for (const [offering, content] of Object.entries(all)) {
          for (const pack of content.availablePackages) {
            const offer = offerOf(offering, pack);
            if (!offer) continue;
            packages.set(offer.id, pack);
            found.push(offer);
          }
        }
        return sortOffers(found);
      },
      async purchase(offerId) {
        const pack = packages.get(offerId);
        if (!pack) throw new Error('unknown offer');
        try {
          await Purchases.purchasePackage(pack);
          return 'purchased';
        } catch (failure) {
          if ((failure as { userCancelled?: boolean | null }).userCancelled) return 'cancelled';
          throw failure;
        }
      },
      async restore() {
        configure();
        await Purchases.restorePurchases();
      },
      async manageUrl() {
        configure();
        return (await Purchases.getCustomerInfo()).managementURL;
      },
    }
  : UNAVAILABLE_DEVICE;
