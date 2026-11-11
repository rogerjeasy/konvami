/** Keep each situation together without changing the learner's newest-first ordering. */
export function groupPhrases<Phrase extends { situation: string | null }>(phrases: Phrase[]) {
  const groups = new Map<string | null, Phrase[]>();
  for (const phrase of phrases) {
    const name = phrase.situation?.trim() || null;
    const group = groups.get(name) ?? [];
    group.push(phrase);
    groups.set(name, group);
  }
  return Array.from(groups, ([name, phrases]) => ({ name, phrases }));
}
