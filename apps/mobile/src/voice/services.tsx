import { createContext, useContext, type ReactNode } from 'react';
import type { CallPurpose } from '@konvami/api-client';
import type { VoiceEngine } from './engine';

/**
 * Makes the engine for one live call. `personaId` is the partner of a practice call; the guide's
 * calls have none. `scenario` makes a practice call a role-play; `practise` puts a grammar topic
 * first in its plan. The app provides the real factory; tests provide a fake.
 */
export type VoiceEngineFactory = (
  purpose: CallPurpose,
  personaId?: string,
  scenario?: string,
  practise?: string,
) => VoiceEngine;

const VoiceContext = createContext<VoiceEngineFactory | null>(null);

export function VoiceProvider({
  createEngine,
  children,
}: {
  createEngine: VoiceEngineFactory;
  children: ReactNode;
}) {
  return <VoiceContext.Provider value={createEngine}>{children}</VoiceContext.Provider>;
}

export function useVoiceEngineFactory(): VoiceEngineFactory {
  const factory = useContext(VoiceContext);
  if (!factory) throw new Error('useVoiceEngineFactory must be used inside VoiceProvider');
  return factory;
}
