import { diffWords } from './word-diff';

describe('diffWords', () => {
  it('marks the word that was replaced', () => {
    expect(diffWords('Ich habe nach Berlin gefahren', 'Ich bin nach Berlin gefahren')).toEqual({
      before: [
        { text: 'Ich', changed: false },
        { text: 'habe', changed: true },
        { text: 'nach Berlin gefahren', changed: false },
      ],
      after: [
        { text: 'Ich', changed: false },
        { text: 'bin', changed: true },
        { text: 'nach Berlin gefahren', changed: false },
      ],
    });
  });

  it('marks a word that moved, where it was and where it went', () => {
    expect(diffWords('weil es war sehr interessant', 'weil es sehr interessant war')).toEqual({
      before: [
        { text: 'weil es', changed: false },
        { text: 'war', changed: true },
        { text: 'sehr interessant', changed: false },
      ],
      after: [
        { text: 'weil es sehr interessant', changed: false },
        { text: 'war', changed: true },
      ],
    });
  });

  it('marks words that were added or left out', () => {
    expect(diffWords('Ich habe nicht Zeit', 'Ich habe keine Zeit mehr')).toEqual({
      before: [
        { text: 'Ich habe', changed: false },
        { text: 'nicht', changed: true },
        { text: 'Zeit', changed: false },
      ],
      after: [
        { text: 'Ich habe', changed: false },
        { text: 'keine', changed: true },
        { text: 'Zeit', changed: false },
        { text: 'mehr', changed: true },
      ],
    });
  });

  it('takes no notice of capitals and punctuation, and keeps them as written', () => {
    expect(diffWords('Mit der Bus.', 'mit dem Bus')).toEqual({
      before: [
        { text: 'Mit', changed: false },
        { text: 'der', changed: true },
        { text: 'Bus.', changed: false },
      ],
      after: [
        { text: 'mit', changed: false },
        { text: 'dem', changed: true },
        { text: 'Bus', changed: false },
      ],
    });
  });

  it('marks everything when nothing is shared', () => {
    expect(diffWords('Guten Tag', 'Hallo zusammen')).toEqual({
      before: [{ text: 'Guten Tag', changed: true }],
      after: [{ text: 'Hallo zusammen', changed: true }],
    });
  });

  it('marks nothing when both say the same', () => {
    expect(diffWords('Das  ist gut', 'das ist gut!')).toEqual({
      before: [{ text: 'Das ist gut', changed: false }],
      after: [{ text: 'das ist gut!', changed: false }],
    });
  });

  it('has no parts for an empty sentence', () => {
    expect(diffWords('', '  ')).toEqual({ before: [], after: [] });
  });
});
