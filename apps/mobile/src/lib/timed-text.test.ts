import { timedText } from './timed-text';

it('preserves punctuation and highlights only the actual timed word', () => {
  expect(
    timedText(
      'Hallo, Welt!',
      [
        { word: 'Hallo', startMs: 100, endMs: 300 },
        { word: 'Welt', startMs: 500, endMs: 900 },
      ],
      650,
    ),
  ).toEqual([
    { text: 'Hallo', active: false },
    { text: ', ', active: false },
    { text: 'Welt', active: true },
    { text: '!', active: false },
  ]);
});
it('does not guess timings for different words or pauses', () => {
  expect(timedText('Hallo', [{ word: 'Hello', startMs: 0, endMs: 300 }], 100)).toEqual([
    { text: 'Hallo', active: false },
  ]);
  expect(timedText('Hallo', [{ word: 'Hallo', startMs: 200, endMs: 300 }], 100)).toEqual([
    { text: 'Hallo', active: false },
  ]);
});
