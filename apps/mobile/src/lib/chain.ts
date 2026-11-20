import type { ChainPlayPart, ChainStory } from '@konvami/api-client';

/**
 * Pure rules of the story chain's screens (section 9): when a story is worth reading again, how
 * far the chain of lines is, and how long a part of the radio play without sound stays on screen.
 */

// A part of the radio play with no sound (the narrator could not be spoken) stays on screen as
// long as it takes to read: about this long per word (ms), and never shorter than the minimum.
export const READ_MS_PER_WORD = 380;
export const READ_MS_MIN = 2400;

/** How long a silent part of the radio play is shown before the next one starts. */
export function readingTime(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(READ_MS_MIN, words * READ_MS_PER_WORD);
}

/**
 * Whether the server is working on the story right now, so the screen reads it again: a line of
 * the learner's being checked, AI characters saying theirs, or the radio play being made.
 */
export function storyIsWaiting(story: ChainStory): boolean {
  if (story.mine.some((line) => line.status === 'checking')) return true;
  if (story.status === 'finishing') return true;
  if (story.status === 'done') return story.playStatus === 'pending';
  const turn = story.seats.find((seat) => seat.seat === story.turnSeat);
  return Boolean(turn?.ai);
}

/** The lines said so far out of all of them, for the chain of links (0 to 1). */
export function chainShare(said: number, lines: number): number {
  if (lines <= 0) return 0;
  return Math.min(1, Math.max(0, said / lines));
}

/** The part of the radio play that follows `index`, skipping what the learner cannot hear. */
export function nextPart(play: readonly ChainPlayPart[], index: number): number | null {
  for (let next = index + 1; next < play.length; next += 1) {
    const part = play[next];
    if (part && !part.hidden) return next;
  }
  return null;
}

/** The first part of the radio play the learner can hear. */
export function firstPart(play: readonly ChainPlayPart[]): number | null {
  return nextPart(play, -1);
}
