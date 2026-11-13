import { captionWords } from './caption-words';

test('preserves the caption and only makes whole Unicode words selectable', () => {
  const text = 'L’année: aujourd’hui, 3 rendez-vous!';
  const parts = captionWords(text);
  expect(parts.map((part) => part.text).join('')).toBe(text);
  expect(parts.filter((part) => part.word).map((part) => part.text)).toEqual([
    'L’année',
    'aujourd’hui',
    'rendez-vous',
  ]);
});

test('normalizes decomposed accents to the same selection the API accepts', () => {
  expect(captionWords('cafe\u0301').filter((part) => part.word)).toEqual([
    { text: 'café', word: true },
  ]);
});
