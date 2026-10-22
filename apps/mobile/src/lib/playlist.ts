/**
 * Playing a recorded conversation (5.6): a turn's recording plays, then the next one that has a
 * recording, and so on, as voice notes in a chat do.
 */

/** The index of the first turn after `after` that has a recording, or null. */
export function nextRecorded(turns: readonly { audio?: unknown }[], after: number): number | null {
  for (let index = after + 1; index < turns.length; index++) {
    if (turns[index]?.audio) return index;
  }
  return null;
}
