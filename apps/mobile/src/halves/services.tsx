import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ApiClient, Halves, HalvesCase } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';

/** What Two Halves (section 7) asks of the server. */
export type HalvesApi = Pick<
  ApiClient,
  | 'getHalves'
  | 'joinHalves'
  | 'changeHalves'
  | 'rerollHalvesCodename'
  | 'leaveHalves'
  | 'startHalvesCase'
  | 'createHalvesInvite'
  | 'cancelHalvesInvite'
  | 'redeemHalvesInvite'
  | 'startHalvesDuoCase'
  | 'removeHalvesDuo'
  | 'removeHalvesBlock'
  | 'getHalvesCase'
  | 'sendHalvesMove'
  | 'solveHalvesCase'
  | 'playHalvesAgain'
  | 'handOverHalvesSeat'
  | 'blockHalvesPartner'
  | 'getHalvesRecapAudio'
  | 'getHalvesMoveAudio'
  | 'reactToHalvesMove'
  | 'answerHalvesMove'
  | 'reportHalvesMove'
  | 'getHalvesQueue'
  | 'decideHalvesItem'
>;

const HalvesContext = createContext<HalvesApi | null>(null);

export function HalvesProvider({ api, children }: { api: HalvesApi; children: ReactNode }) {
  return <HalvesContext.Provider value={api}>{children}</HalvesContext.Provider>;
}

export function useHalvesApi(): HalvesApi {
  const api = useContext(HalvesContext);
  if (!api) throw new Error('useHalvesApi needs a HalvesProvider');
  return api;
}

export type Loaded<T> =
  { phase: 'loading' } | { phase: 'failed'; code: string } | { phase: 'ready'; data: T };

// While a move is being checked or the AI is answering, a case is read again this often (ms):
// the check takes seconds, and nobody should have to pull to see their move arrive.
export const POLL_MS = 4000;

/** Reads something once and again on `refresh`; a failure while reading again keeps what is shown.
 * Also the story chain's (`chain/services.tsx`). */
export function useLoaded<T>(read: (() => Promise<T>) | null, again: (data: T) => boolean) {
  const [state, setState] = useState<Loaded<T>>({ phase: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!read) return;
    let current = true;
    read().then(
      (data) => current && setState({ phase: 'ready', data }),
      (error: unknown) =>
        current &&
        setState((shown) =>
          shown.phase === 'ready' ? shown : { phase: 'failed', code: apiErrorCode(error) },
        ),
    );
    return () => {
      current = false;
    };
  }, [read, tick]);
  const waiting = state.phase === 'ready' && again(state.data);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setTick((count) => count + 1), POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, tick]);
  const refresh = useCallback(() => setTick((count) => count + 1), []);
  const set = useCallback((data: T) => setState({ phase: 'ready', data }), []);
  return { state, refresh, set };
}

/** Two Halves' hub (7.1). `enabled` false reads nothing (signed out). */
export function useHalvesHub(enabled = true) {
  const api = useHalvesApi();
  const read = useCallback(() => api.getHalves(), [api]);
  return useLoaded<Halves>(enabled ? read : null, () => false);
}

/** Whether a case is waiting for the server: a move being checked, the stand-in, the recap. */
export function caseIsWaiting(found: HalvesCase): boolean {
  if (found.rounds.some((round) => round.mine?.status === 'checking')) return true;
  if (found.status !== 'open') return found.recapStatus === 'pending';
  // Against the AI, the stand-in answers within moments.
  return found.partner.ai && found.recordRound === null && !found.final.open;
}

/** One case as the learner's seat sees it (7.4), read again while the server is working. */
export function useHalvesCase(id: string | null) {
  const api = useHalvesApi();
  const read = useCallback(() => api.getHalvesCase(id ?? ''), [api, id]);
  return useLoaded<HalvesCase>(id ? read : null, caseIsWaiting);
}
