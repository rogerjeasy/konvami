import { UNAVAILABLE_DEVICE, type PurchaseDevice } from './device';

/**
 * The web preview cannot buy: plans are bought in the phone app. A visual check
 * (`.playwright-mcp/check`) may stand in for a phone by setting `__konvamiPurchaseDevice` before
 * the app loads.
 */
const standIn = (globalThis as { __konvamiPurchaseDevice?: PurchaseDevice })
  .__konvamiPurchaseDevice;

export const appPurchaseDevice: PurchaseDevice = standIn ?? UNAVAILABLE_DEVICE;
