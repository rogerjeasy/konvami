/** A correction of a report: the learner's words, and the same words put right. */
interface Fix {
  original: string;
  corrected: string;
}

/** `text` with `fix` put in, matching the learner's words whatever their capitals; null when
 * they are not in it. */
function putIn(text: string, fix: Fix): string | null {
  const at = text.toLowerCase().indexOf(fix.original.toLowerCase());
  if (at < 0) return null;
  return text.slice(0, at) + fix.corrected + text.slice(at + fix.original.length);
}

/**
 * The sentence a learner says again to practise a correction ("Say it better", spec §6.5): what
 * they said in that turn with the correction put in, and the other confirmed corrections of the
 * same turn as well, so they never practise one fix while repeating another mistake. When the
 * words cannot be found in what was said, the corrected words alone.
 */
export function practiceSentence(said: string | null, fix: Fix, others: readonly Fix[]): string {
  const sentence = said ? putIn(said, fix) : null;
  if (sentence === null) return fix.corrected;
  return others.reduce((text, other) => putIn(text, other) ?? text, sentence);
}
