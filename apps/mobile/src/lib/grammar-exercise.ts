/** Practice uses curated examples, so no generated rule or ambiguous distractor can teach an error. */
export interface GrammarExercise {
  kind: 'cloze' | 'order';
  prompt: string;
  answer: string;
  example: string;
  words: string[];
}

/** A short sitting revisits at most three examples in two ways each. */
const EXAMPLES_PER_SITTING = 3;

export function buildExercises(examples: readonly string[]): GrammarExercise[] {
  return examples
    .map((example) => example.trim())
    .filter(Boolean)
    .slice(0, EXAMPLES_PER_SITTING)
    .flatMap((example) => {
      const words = example.split(/\s+/u);
      // The middle word leaves context on both sides, rather than guessing from no sentence.
      const gap = Math.floor(words.length / 2);
      return [
        {
          kind: 'cloze' as const,
          prompt: words.map((word, index) => (index === gap ? '____' : word)).join(' '),
          answer: words[gap] ?? '',
          example,
          words: [],
        },
        {
          kind: 'order' as const,
          prompt: '',
          answer: example,
          example,
          words: [...words].reverse(),
        },
      ];
    });
}

export function matchesExample(answer: string, expected: string): boolean {
  const normalise = (text: string) =>
    text
      .normalize('NFKC')
      .trim()
      .replace(/[.!?]+$/u, '')
      .replace(/\s+/gu, ' ')
      .toLocaleLowerCase();
  return normalise(answer) === normalise(expected);
}
