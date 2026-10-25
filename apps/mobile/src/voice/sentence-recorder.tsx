import { createContext, useContext, type ReactNode } from 'react';

/** A sentence the learner recorded on the device, ready to send. */
export interface SentenceRecording {
  /** The audio file, in base64. */
  base64: string;
  /** "m4a" on a phone, "webm" in a browser. */
  format: 'm4a' | 'webm';
  durationMs: number;
  /** Where the file is on the device, to play it back. */
  uri: string;
}

/** Why recording could not start: the microphone is not allowed, or not there. */
export class RecorderError extends Error {
  constructor(readonly code: 'mic_denied' | 'unavailable') {
    super(code);
  }
}

/** Records one sentence at a time ("Say it better", spec §6.5). */
export interface SentenceRecorder {
  /** Starts recording. Rejects with a `RecorderError` when it cannot. */
  start(): Promise<void>;
  /** Stops and hands over what was recorded; null when nothing was. */
  stop(): Promise<SentenceRecording | null>;
}

/** Gives a component its recorder; a hook, as recording lives as long as the component. */
export type UseSentenceRecorder = () => SentenceRecorder;

const RecorderContext = createContext<UseSentenceRecorder | null>(null);

/** Provides the way to record: the device's microphone in the app, a fake in tests. */
export function RecorderProvider({
  useRecorder,
  children,
}: {
  useRecorder: UseSentenceRecorder;
  children: ReactNode;
}) {
  return <RecorderContext.Provider value={useRecorder}>{children}</RecorderContext.Provider>;
}

/** The recorder of the component that calls it. */
export function useSentenceRecorder(): SentenceRecorder {
  const useRecorder = useContext(RecorderContext);
  if (!useRecorder) throw new Error('useSentenceRecorder must be used inside RecorderProvider');
  return useRecorder();
}
