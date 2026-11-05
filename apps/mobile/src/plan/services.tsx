import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from '@/auth';
import { useProfileServices, usePlan } from '@/profile/services';
import type { PurchaseDevice, StoreOffer } from './device';

/** Why the plans are being offered: it decides the line at the top of the sheet. */
export type PaywallReason = 'plans' | 'minutes' | 'partners' | 'exams' | 'trial';

interface Purchases {
  device: PurchaseDevice;
  reason: PaywallReason | null;
  open: (reason: PaywallReason) => void;
  close: () => void;
}

const PurchasesContext = createContext<Purchases | null>(null);

/**
 * The store for the whole app: it names the signed-in learner to the store once their plan is
 * known (the plan carries their id), forgets them on sign-out, and holds whether the sheet that
 * offers the plans is open and why.
 */
export function PlanProvider({
  device,
  children,
}: {
  device: PurchaseDevice;
  children: ReactNode;
}) {
  const { status } = useSession();
  const { plan } = useProfileServices();
  const state = usePlan();
  const [reason, setReason] = useState<PaywallReason | null>(null);
  const userId = state.phase === 'ready' ? state.data.userId : null;

  useEffect(() => {
    // The plan is read for the store (it carries the learner's id) only where one can sell.
    if (status === 'signedIn' && device.available) void plan.load();
    if (status === 'signedOut') void device.signOut().catch(() => {});
  }, [status, plan, device]);
  useEffect(() => {
    if (device.available && status === 'signedIn' && userId) {
      void device.signIn(userId).catch(() => {});
    }
  }, [device, status, userId]);

  const open = useCallback((why: PaywallReason) => setReason(why), []);
  const close = useCallback(() => setReason(null), []);
  // Nobody is offered anything once signed out, whatever was open before.
  const shown = status === 'signedIn' ? reason : null;
  const value = useMemo(
    () => ({ device, reason: shown, open, close }),
    [device, shown, open, close],
  );
  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

function usePurchases(): Purchases {
  const purchases = useContext(PurchasesContext);
  if (!purchases) throw new Error('Purchases are used outside PlanProvider');
  return purchases;
}

export function usePurchaseDevice(): PurchaseDevice {
  return usePurchases().device;
}

/** The sheet that offers the plans: open it with a reason, close it when done. */
export function usePaywall() {
  const { reason, open, close } = usePurchases();
  return { reason, open, close };
}

export type OffersState =
  { phase: 'loading' } | { phase: 'ready'; offers: StoreOffer[] } | { phase: 'failed' };

/** The store's offers, read when `enabled` (the sheet is open) and the build can sell. */
export function useOffers(enabled: boolean): OffersState & { reload: () => void } {
  const device = usePurchaseDevice();
  const [attempt, setAttempt] = useState(0);
  // What an attempt found; an answer to an earlier attempt shows as loading again.
  const [found, setFound] = useState<{ attempt: number; state: OffersState } | null>(null);
  useEffect(() => {
    if (!enabled || !device.available) return;
    let live = true;
    device
      .offers()
      .then((offers) => live && setFound({ attempt, state: { phase: 'ready', offers } }))
      .catch(() => live && setFound({ attempt, state: { phase: 'failed' } }));
    return () => {
      live = false;
    };
  }, [enabled, device, attempt]);
  const state: OffersState = found?.attempt === attempt ? found.state : { phase: 'loading' };
  return { ...state, reload: () => setAttempt((n) => n + 1) };
}
