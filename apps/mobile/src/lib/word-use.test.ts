import { blankWord, usesWord } from './word-use';

describe('whether the learner used a word of their plan', () => {
  it('finds a noun without its article, in any case and with an ending', () => {
    expect(usesWord('der Termin', 'Ich habe morgen einen Termin.', 'de')).toBe(true);
    expect(usesWord('der Termin', 'Zwei Termine, das ist viel.', 'de')).toBe(true);
    expect(usesWord('die Ausstellung', 'Die Ausstellungen waren toll', 'de')).toBe(true);
  });

  it('finds a verb in its forms', () => {
    expect(usesWord('pünktlich', 'Der Zug war nicht pünktlich.', 'de')).toBe(true);
    expect(usesWord('besuchen', 'Ich besuche meine Oma.', 'de')).toBe(true);
  });

  it('finds a separable verb whose prefix went to the end', () => {
    expect(usesWord('umsteigen', 'Ich steige in Köln um.', 'de')).toBe(true);
    expect(usesWord('anrufen', 'Ich rufe dich morgen an', 'de')).toBe(true);
    expect(usesWord('anrufen', 'Ich habe sie gestern angerufen.', 'de')).toBe(true);
  });

  it('does not count the verb without its prefix', () => {
    expect(usesWord('umsteigen', 'Ich steige in Köln aus.', 'de')).toBe(false);
  });

  it('finds the main word of a phrase', () => {
    expect(usesWord('sich freuen auf', 'Ich freue mich auf das Wochenende.', 'de')).toBe(true);
  });

  it('does not count a word that only starts the same way', () => {
    expect(usesWord('der Tisch', 'Das ist typisch.', 'de')).toBe(false);
    expect(usesWord('das Rad', 'Ich rate mal.', 'de')).toBe(false);
  });

  it('compares plainly in a language it has no rules for', () => {
    expect(usesWord('la gare', 'Je vais à la gare.', 'fr')).toBe(true);
    expect(usesWord('la gare', 'Je vais au marché.', 'fr')).toBe(false);
  });
});

describe('blankWord', () => {
  it('blanks the word out of its sentence, keeping the rest as written', () => {
    expect(blankWord('Ich habe morgen einen Termin.', 'der Termin', 'de')).toBe(
      'Ich habe morgen einen ___.',
    );
  });

  it('blanks a form of the word', () => {
    expect(blankWord('Wir besuchen dich am Sonntag.', 'besuchen', 'de')).toBe(
      'Wir ___ dich am Sonntag.',
    );
    expect(blankWord('Die Termine sind voll.', 'der Termin', 'de')).toBe('Die ___ sind voll.');
    expect(blankWord('Ich habe sie besucht.', 'besuchen', 'de')).toBe('Ich habe sie ___.');
  });

  it('blanks the main word of a phrase', () => {
    expect(blankWord('Ich freue mich auf Sonntag.', 'sich freuen auf', 'de')).toBe(
      'Ich ___ mich auf Sonntag.',
    );
  });

  it('gives nothing when the sentence does not have the word', () => {
    expect(blankWord('Das passt mir gut.', 'der Termin', 'de')).toBeNull();
    expect(blankWord('', 'der Termin', 'de')).toBeNull();
  });

  it('blanks the words of a language without rules as they are', () => {
    expect(blankWord('See you on Friday.', 'on Friday', 'en')).toBe('See you ___.');
    expect(blankWord('See you then.', 'on Friday', 'en')).toBeNull();
  });
});
