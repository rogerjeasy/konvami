import { createContext, useContext, type ReactNode } from 'react';
import type { CallPurpose } from '@konvami/api-client';
import type { VoiceEngine } from './engine';

/** Makes the engine for one live call. The app provides the real one; tests provide a fake. */
export type VoiceEngineFactory = (purpose: CallPurpose) => VoiceEngine;

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
