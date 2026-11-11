import { groupPhrases } from './phrase-groups';

it('groups situations in first-seen order and retains ungrouped phrases', () => {
  const phrases = [
    { id: '1', situation: 'Travel' },
    { id: '2', situation: null },
    { id: '3', situation: 'Travel' },
    { id: '4', situation: 'Work' },
  ];
  expect(groupPhrases(phrases)).toEqual([
    { name: 'Travel', phrases: [phrases[0], phrases[2]] },
    { name: null, phrases: [phrases[1]] },
    { name: 'Work', phrases: [phrases[3]] },
  ]);
  expect(groupPhrases([])).toEqual([]);
});
