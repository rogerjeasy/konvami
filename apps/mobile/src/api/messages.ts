import { ApiError } from '@konvami/api-client';

/** The code of anything thrown by an API call; anything else counts as `unknown`. */
export function apiErrorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'unknown';
}

/** Translation key of the message for a failed API call. */
export function apiErrorKey(code: string) {
  return code === 'network' ? 'errors.network' : 'errors.unknown';
}
