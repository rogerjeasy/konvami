/** A run of words of a sentence, and whether the other version has them too. */
export interface DiffPart {
  text: string;
  changed: boolean;
}

/** A word as it is compared: without capitals and punctuation, which speech does not have. */
const bare = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Per word of `a`, whether it belongs to the longest run of words `a` and `b` share in order. */
function shared(a: string[], b: string[]): [boolean[], boolean[]] {
  // lengths[i][j]: how many words the rest of `a` from i and the rest of `b` from j share.
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  const at = (i: number, j: number) => lengths[i]?.[j] ?? 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = lengths[i];
      if (row) row[j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const inA = new Array<boolean>(a.length).fill(false);
  const inB = new Array<boolean>(b.length).fill(false);
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      inA[i] = true;
      inB[j] = true;
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return [inA, inB];
}

/** Joins neighbouring words that are alike (all shared, or all changed) into one part. */
function parts(words: string[], kept: boolean[]): DiffPart[] {
  const result: DiffPart[] = [];
  words.forEach((word, i) => {
    const changed = !kept[i];
    const last = result.at(-1);
    if (last && last.changed === changed) last.text += ` ${word}`;
    else result.push({ text: word, changed });
  });
  return result;
}

/**
 * Compares two versions of a sentence word by word, so a correction can show what changed: the
 * words only one version has are `changed`, in each version as it was written.
 */
export function diffWords(
  before: string,
  after: string,
): { before: DiffPart[]; after: DiffPart[] } {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  const [inA, inB] = shared(a.map(bare), b.map(bare));
  return { before: parts(a, inA), after: parts(b, inB) };
}
