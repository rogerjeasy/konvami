/** Match the API's caption selection rule: a whole word, including elisions and hyphens. */
const WORD = /[\p{L}]+(?:['’\-][\p{L}]+)*/gu;

export interface CaptionPart {
  text: string;
  word: boolean;
}

export function captionWords(caption: string): CaptionPart[] {
  const normalized = caption.normalize('NFC');
  const parts: CaptionPart[] = [];
  let cursor = 0;
  for (const match of normalized.matchAll(WORD)) {
    if (match.index > cursor)
      parts.push({ text: normalized.slice(cursor, match.index), word: false });
    parts.push({ text: match[0], word: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < normalized.length) parts.push({ text: normalized.slice(cursor), word: false });
  return parts;
}
