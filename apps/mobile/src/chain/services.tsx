import { createContext, useCallback, useContext, type ReactNode } from 'react';
import type { ApiClient, Chain, ChainStory } from '@konvami/api-client';
import { useLoaded } from '@/halves/services';
import { storyIsWaiting } from '@/lib/chain';

/** What the story chain (section 9) asks of the server. */
export type ChainApi = Pick<
  ApiClient,
  | 'getChain'
  | 'joinChain'
  | 'changeChain'
  | 'rerollChainCodename'
  | 'leaveChain'
  | 'removeChainBlock'
  | 'startChainStory'
  | 'redeemChainInvite'
  | 'getChainStory'
  | 'createChainInvite'
  | 'fillChainSeats'
  | 'sendChainLine'
  | 'reactToChainStory'
  | 'leaveChainStory'
  | 'blockChainPlayer'
  | 'getChainOpeningAudio'
  | 'getChainPlayAudio'
  | 'getChainLineAudio'
  | 'reportChainLine'
  | 'retryChainLine'
  | 'saveChainCard'
  | 'getChainQueue'
  | 'decideChainItem'
>;

const ChainContext = createContext<ChainApi | null>(null);

export function ChainProvider({ api, children }: { api: ChainApi; children: ReactNode }) {
  return <ChainContext.Provider value={api}>{children}</ChainContext.Provider>;
}

export function useChainApi(): ChainApi {
  const api = useContext(ChainContext);
  if (!api) throw new Error('useChainApi needs a ChainProvider');
  return api;
}

/** The story chain's hub (9.1). `enabled` false reads nothing (signed out). */
export function useChainHub(enabled = true) {
  const api = useChainApi();
  const read = useCallback(() => api.getChain(), [api]);
  return useLoaded<Chain>(enabled ? read : null, () => false);
}

/** One story as the learner's seat knows it, read again while the server works on it. */
export function useChainStory(id: string | null) {
  const api = useChainApi();
  const read = useCallback(() => api.getChainStory(id ?? ''), [api, id]);
  return useLoaded<ChainStory>(id ? read : null, storyIsWaiting);
}
