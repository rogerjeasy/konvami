import { practiceSentence } from './practice-sentence';

const perfekt = {
  original: 'Ich habe nach Berlin gefahren',
  corrected: 'Ich bin nach Berlin gefahren',
};
const dative = { original: 'mit der Bus', corrected: 'mit dem Bus' };

describe('the sentence a learner practises saying better', () => {
  it('is what they said with the correction put in', () => {
    expect(practiceSentence('Gut. Ich habe nach Berlin gefahren.', perfekt, [])).toBe(
      'Gut. Ich bin nach Berlin gefahren.',
    );
  });

  it('puts in the other confirmed corrections of the same turn too', () => {
    expect(
      practiceSentence('Gut. Ich habe nach Berlin gefahren mit der Bus.', perfekt, [dative]),
    ).toBe('Gut. Ich bin nach Berlin gefahren mit dem Bus.');
  });

  it('finds the words whatever their capitals', () => {
    expect(practiceSentence('gut, ich habe nach berlin gefahren', perfekt, [])).toBe(
      'gut, Ich bin nach Berlin gefahren',
    );
  });

  it('is the corrected words alone when what was said cannot be found', () => {
    expect(practiceSentence('Ich war in Bern.', perfekt, [])).toBe('Ich bin nach Berlin gefahren');
    expect(practiceSentence(null, perfekt, [])).toBe('Ich bin nach Berlin gefahren');
  });
});
