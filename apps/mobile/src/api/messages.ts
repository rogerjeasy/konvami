import { ApiError } from '@konvami/api-client';

/** The code of anything thrown by an API call; anything else counts as `unknown`. */
export function apiErrorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'unknown';
}

/**
 * Why the server turned down words the learner wrote for a partner (moderation, spec §6.21.4):
 * they read like an order to the model, hold a link or contact data, or are unsafe; the check
 * could not be made; or too many were turned down today. Each has a sentence of its own.
 */
const MODERATION_KEYS = {
  text_instructions: 'errors.moderation.text_instructions',
  text_link: 'errors.moderation.text_link',
  text_contact: 'errors.moderation.text_contact',
  text_unsafe: 'errors.moderation.text_unsafe',
  moderation_unavailable: 'errors.moderation.moderation_unavailable',
  moderation_limit: 'errors.moderation.moderation_limit',
} as const;

function isModerationCode(code: string): code is keyof typeof MODERATION_KEYS {
  return code in MODERATION_KEYS;
}

/** Translation key of the message for a failed API call. */
export function apiErrorKey(code: string) {
  if (isModerationCode(code)) return MODERATION_KEYS[code];

  if (code === 'plan_required') return 'errors.planRequired';
  return code === 'network' ? 'errors.network' : 'errors.unknown';
}

/**
 * How a failed save is announced. Words that were turned down are something to reword, not a
 * fault, so they get the calm note; every other failure keeps the alarm.
 */
export function problemTone(code: string): 'surface' | 'danger' {
  return isModerationCode(code) ? 'surface' : 'danger';
}

/** A failed save as a screen shows it: the sentence and the tone of its note. */
export interface Failure {
  message: string;
  tone: 'surface' | 'danger';
}

export function failureOf(message: string, code: string): Failure {
  return { message, tone: problemTone(code) };
}
