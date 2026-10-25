/**
 * Whether a learner used a word of their conversation's plan (spec §6.4 "3 of 5 target words
 * used"), from what they said. Words change their form as they are used, so a word counts when
 * its main part appears with a usual ending; a language pack's own rules (German articles and
 * separable verbs) make the guess closer. It is a nudge on screen, not a score: a near miss
 * costs nothing.
 */

interface WordRules {
  /** Little words of a dictionary entry that are not the word itself ("der", "sich"). */
  minor: ReadonlySet<string>;
  /** Endings a word drops to give the part its forms share ("besuch-en"). */
  endings: readonly string[];
  /** Prefixes of separable verbs, which can stand apart at the end of a sentence. */
  separable: readonly string[];
  /** What a past participle puts before the verb ("ge-besucht"). */
  participle: string;
}

const GERMAN: WordRules = {
  minor: new Set(
    'der die das den dem des ein eine einen einem einer eines sich etwas jemand jemanden jemandem auf an für mit über von zu um in aus'.split(
      ' ',
    ),
  ),
  // Longest first, so that "-ern" goes before "-n".
  endings: ['ern', 'eln', 'en', 'er', 'es', 'e', 'n', 's'],
  separable: [
    'zurück',
    'fest',
    'fern',
    'nach',
    'weg',
    'vor',
    'mit',
    'ein',
    'aus',
    'auf',
    'los',
    'her',
    'hin',
    'ab',
    'an',
    'um',
    'zu',
  ],
  participle: 'ge',
};

const RULES: Record<string, WordRules> = { de: GERMAN };

// How much longer than the shared part a form may be ("Termin" → "Termine", "besuch" → "besuchst").
const MAX_ENDING = 3;
// A shared part shorter than this matches too much ("Rad" would match "Rate").
const MIN_STEM = 3;

/** A text's words, without capitals and punctuation, which speech does not have. */
const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

function stemOf(word: string, rules: WordRules): string {
  const ending = rules.endings.find(
    (end) => word.endsWith(end) && word.length - end.length >= MIN_STEM,
  );
  return ending ? word.slice(0, -ending.length) : word;
}

/** Whether `form` is the stem with one of its endings (or none). */
const formOf = (form: string, stem: string) =>
  form.startsWith(stem) && form.length - stem.length <= MAX_ENDING;

/** The main word of a dictionary entry: its longest one ("sich freuen auf" → "freuen"). */
function mainWord(entry: string, rules: WordRules): string {
  const parts = wordsOf(entry).filter((part) => !rules.minor.has(part));
  return parts.reduce((longest, part) => (part.length > longest.length ? part : longest), '');
}

function usesUnder(entry: string, said: readonly string[], rules: WordRules): boolean {
  const main = mainWord(entry, rules);
  if (!main) return false;
  const stem = stemOf(main, rules);
  const prefix = rules.separable.find(
    (start) => main.startsWith(start) && main.length - start.length > MIN_STEM,
  );
  if (!prefix) {
    return said.some((form) => formOf(form, stem) || formOf(form, rules.participle + stem));
  }
  const core = stem.slice(prefix.length);
  return said.some(
    (form, index) =>
      formOf(form, stem) ||
      formOf(form, prefix + rules.participle + core) ||
      // The prefix went to the end: "Ich steige in Köln um."
      (formOf(form, core) && said.slice(index + 1).includes(prefix)),
  );
}

/** Whether `text` uses the dictionary entry `word` of a language (an ISO 639-1 code). */
export function usesWord(word: string, text: string, language: string): boolean {
  const said = wordsOf(text);
  const rules = RULES[language];
  if (rules) return usesUnder(word, said, rules);
  // No rules: the entry's words, together and in order.
  const entry = wordsOf(word);
  return (
    entry.length > 0 &&
    said.some((_, start) => entry.every((part, offset) => said[start + offset] === part))
  );
}

// What stands for the word taken out of a sentence.
const BLANK = '___';

/**
 * A sentence with the dictionary entry `word` taken out (a cloze: "Ich habe morgen einen ___."),
 * to ask for the word in the sentence it came from; null when the sentence does not have it.
 * The rest stays as written. A language pack's rules find the word in its forms, as `usesWord`
 * does; a separable verb whose prefix went to the end is not taken out.
 */
export function blankWord(sentence: string, word: string, language: string): string | null {
  const tokens = [...sentence.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({
    text: match[0].toLowerCase(),
    start: match.index,
    end: match.index + match[0].length,
  }));
  const rules = RULES[language];
  let span: { start: number; end: number } | undefined;
  if (rules) {
    const main = mainWord(word, rules);
    const stem = main ? stemOf(main, rules) : '';
    const found = tokens.find(
      (token) => stem && (formOf(token.text, stem) || formOf(token.text, rules.participle + stem)),
    );
    span = found;
  } else {
    const entry = wordsOf(word);
    const first = tokens.findIndex(
      (_, start) =>
        entry.length > 0 && entry.every((part, offset) => tokens[start + offset]?.text === part),
    );
    const last = tokens[first + entry.length - 1];
    const from = tokens[first];
    if (from && last) span = { start: from.start, end: last.end };
  }
  return span ? sentence.slice(0, span.start) + BLANK + sentence.slice(span.end) : null;
}
