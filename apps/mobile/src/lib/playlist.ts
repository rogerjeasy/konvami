/**
 * Playing a recorded conversation (5.6): a turn's recording plays, then the next one that has a
 * recording, and so on, as voice notes in a chat do.
 */

/**
 * The index of the first turn after `after` that has a recording, or null. Turns may be given
 * in `group`s (the two sides of Then vs Now): playing never goes on into another group.
 */
export function nextRecorded(
  turns: readonly { audio?: unknown; group?: string }[],
  after: number,
): number | null {
  const group = turns[after]?.group;
  for (let index = after + 1; index < turns.length; index++) {
    if (turns[index]?.group !== group) return null;
    if (turns[index]?.audio) return index;
  }
  return null;
}
