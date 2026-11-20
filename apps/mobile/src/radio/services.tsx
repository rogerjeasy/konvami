import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type {
  ApiClient,
  Radio,
  RadioCall,
  RadioEpisode,
  RadioEpisodeCard,
} from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { callIsWaiting } from '@/lib/radio';

/** What Radio Konvami (section 8) asks of the server. */
export type RadioApi = Pick<
  ApiClient,
  | 'getRadio'
  | 'joinRadio'
  | 'changeRadio'
  | 'rerollRadioCodename'
  | 'leaveRadio'
  | 'getRadioArchive'
  | 'getRadioEpisode'
  | 'getRadioSegmentAudio'
  | 'applaudRadioSegment'
  | 'reportRadioSegment'
  | 'sendRadioCall'
  | 'getRadioCall'
  | 'getRadioCallAudio'
  | 'withdrawRadioCall'
  | 'sayRadioCorrectionBetter'
  | 'saveRadioCorrectionCard'
  | 'getRadioQueue'
  | 'decideRadioItem'
  | 'pullRadioEpisode'
>;

const RadioContext = createContext<RadioApi | null>(null);

export function RadioProvider({ api, children }: { api: RadioApi; children: ReactNode }) {
  return <RadioContext.Provider value={api}>{children}</RadioContext.Provider>;
}

export function useRadioApi(): RadioApi {
  const api = useContext(RadioContext);
  if (!api) throw new Error('useRadioApi needs a RadioProvider');
  return api;
}

export type Loaded<T> =
  { phase: 'loading' } | { phase: 'failed'; code: string } | { phase: 'ready'; data: T };

// While a call is being checked or the first show is being made, it is read again this often
// (ms): both take seconds, and nobody should have to pull to see it change.
export const RADIO_POLL_MS = 4000;

/** Reads something once and again on `refresh`; a failure while reading again keeps what is shown. */
function useLoaded<T>(read: (() => Promise<T>) | null, again: (data: T) => boolean) {
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
    const timer = setTimeout(() => setTick((count) => count + 1), RADIO_POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, tick]);
  const refresh = useCallback(() => setTick((count) => count + 1), []);
  const set = useCallback((data: T) => setState({ phase: 'ready', data }), []);
  return { state, refresh, set };
}

/** Whether the hub is waiting for the server: the first show, or the learner's call. */
export function hubIsWaiting(hub: Radio): boolean {
  return hub.warmingUp || hub.calls.some((call) => callIsWaiting(call.status));
}

/** The show's hub (8.1). `enabled` false reads nothing (signed out). */
export function useRadioHub(enabled = true) {
  const api = useRadioApi();
  const read = useCallback(() => api.getRadio(), [api]);
  return useLoaded<Radio>(enabled ? read : null, hubIsWaiting);
}

/** One show (8.2). */
export function useRadioEpisode(id: string | null) {
  const api = useRadioApi();
  const read = useCallback(() => api.getRadioEpisode(id ?? ''), [api, id]);
  return useLoaded<RadioEpisode>(id ? read : null, () => false);
}

/** One of the learner's calls (8.4), read again while it is being checked. */
export function useRadioCall(id: string | null) {
  const api = useRadioApi();
  const read = useCallback(() => api.getRadioCall(id ?? ''), [api, id]);
  return useLoaded<RadioCall>(id ? read : null, (call) => callIsWaiting(call.status));
}

/** The last two weeks of shows (8.5). */
export function useRadioArchive(enabled = true) {
  const api = useRadioApi();
  const read = useCallback(async () => (await api.getRadioArchive()).episodes, [api]);
  return useLoaded<RadioEpisodeCard[]>(enabled ? read : null, () => false);
}
