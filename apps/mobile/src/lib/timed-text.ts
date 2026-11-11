import type { RecordingTiming } from '@konvami/api-client';

/** Keep the original transcript, punctuation and spacing; only exact provider words get marks. */
export function timedText(text: string, words: RecordingTiming['words'], positionMs: number) {
  const parts: { text: string; active: boolean }[] = [];
  let cursor = 0;
  for (const word of words) {
    const start = text.toLocaleLowerCase().indexOf(word.word.toLocaleLowerCase(), cursor);
    if (start < 0) return [{ text, active: false }];
    if (start > cursor) parts.push({ text: text.slice(cursor, start), active: false });
    cursor = start + word.word.length;
    parts.push({
      text: text.slice(start, cursor),
      active: word.startMs <= positionMs && positionMs < word.endMs,
    });
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), active: false });
  return parts;
}
