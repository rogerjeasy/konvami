import { ApiError } from '@konvami/api-client';
import { VoiceError } from './errors';

// Leave room within the server's 45-second handoff window for final cleanup.
export const CONTINUATION_TIMEOUT_MS = 30_000;
export const MAX_CONTINUATIONS = 2;
// The former worker needs time to drain audio and persist its authoritative transcript.
const RETRY_DELAY_MS = 1000;

export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancelled = () => reject(new VoiceError('stopped'));
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) cancelled();
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancelled));
  });
}

function pause(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      signal.removeEventListener('abort', cancelled);
      resolve();
    };
    const timer = setTimeout(done, RETRY_DELAY_MS);
    const cancelled = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancelled);
      reject(new VoiceError('stopped'));
    };
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) cancelled();
  });
}

/** The closure retains one idempotency key and SDP; a retry never creates a new attempt. */
export async function retryContinuation<T>(
  request: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  while (!signal.aborted) {
    try {
      return await abortable(request(), signal);
    } catch (error) {
      if (!(error instanceof ApiError) || !['continuation_pending', 'network'].includes(error.code))
        throw error;
      await pause(signal);
    }
  }
  throw new VoiceError('stopped');
}
