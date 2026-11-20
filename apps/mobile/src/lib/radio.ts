import type { RadioCallStatus, RadioSegment } from '@konvami/api-client';
import { daysUntil } from '@/lib/format';

/**
 * Radio Konvami's rules that need no screen (section 8): what the player plays next, how long a
 * line without sound stays on screen, and how a call's status reads.
 */

// A line the server could not voice is shown as a caption for about the time it takes to read
// it: this long per word (ms), never shorter or longer than the bounds below.
export const CAPTION_MS_PER_WORD = 380;
export const CAPTION_MIN_MS = 2500;
export const CAPTION_MAX_MS = 12_000;

/** How long a caption-only line is shown before the show moves on (ms). */
export function captionMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(CAPTION_MAX_MS, Math.max(CAPTION_MIN_MS, words * CAPTION_MS_PER_WORD));
}

/** Whether the player stops on a segment at all: one the learner reported is skipped. */
export function playsInShow(segment: RadioSegment): boolean {
  return !segment.hidden;
}

/**
 * The position in `segments` of the next segment to play after position `from` (−1 starts the
 * show), or null at the end.
 */
export function nextInShow(segments: readonly RadioSegment[], from: number): number | null {
  for (let at = from + 1; at < segments.length; at += 1) {
    const segment = segments[at];
    if (segment && playsInShow(segment)) return at;
  }
  return null;
}

/** The position of the segment before `from` that plays, or the first one. */
export function previousInShow(segments: readonly RadioSegment[], from: number): number | null {
  for (let at = from - 1; at >= 0; at -= 1) {
    const segment = segments[at];
    if (segment && playsInShow(segment)) return at;
  }
  return nextInShow(segments, -1);
}

/** Whether listeners can give applause cards to a segment: calls, never the host. */
export function takesApplause(segment: RadioSegment): boolean {
  return segment.kind !== 'host' && !segment.hidden;
}

/** Whether the next show airs today or tomorrow, on the device's calendar. */
export function airsWhen(airsAt: string, now: Date): 'today' | 'tomorrow' {
  return daysUntil(airsAt, now) === 0 ? 'today' : 'tomorrow';
}

/** How a call's status sits on a row: lime once on air, amber when it needs a look, quiet else. */
export type CallTone = 'aired' | 'attention' | 'quiet';

export function callTone(status: RadioCallStatus): CallTone {
  if (status === 'aired') return 'aired';
  if (status === 'held' || status === 'failed') return 'attention';
  return 'quiet';
}

/** Whether the server is still working on a call (checking it): read again shortly. */
export function callIsWaiting(status: RadioCallStatus): boolean {
  return status === 'checking';
}
