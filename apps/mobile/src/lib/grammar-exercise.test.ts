import { buildExercises, matchesExample } from './grammar-exercise';

describe('curated grammar practice', () => {
  it('creates cloze and sentence-order practice from real examples', () => {
    const exercises = buildExercises(['Ich fahre mit dem Bus.']);
    expect(exercises.map((exercise) => exercise.kind)).toEqual(['cloze', 'order']);
    expect(exercises[0]?.prompt).toContain('____');
    expect(exercises[1]?.words).toEqual(['Bus.', 'dem', 'mit', 'fahre', 'Ich']);
  });

  it('keeps repeated words as separate choices and skips empty examples', () => {
    const exercises = buildExercises(['', 'Das ist das Haus.']);
    expect(exercises).toHaveLength(2);
    expect(exercises[1]?.words).toHaveLength(4);
  });

  it('accepts whitespace, case and terminal punctuation without ignoring accents', () => {
    expect(matchesExample('  Ich  fahre mit dem Bus! ', 'ich fahre mit dem Bus.')).toBe(true);
    expect(matchesExample('ou', 'où')).toBe(false);
    expect(matchesExample('Bus mit dem ich fahre', 'Ich fahre mit dem Bus')).toBe(false);
  });
});
