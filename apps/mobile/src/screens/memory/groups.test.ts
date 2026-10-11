import type { Memory } from '@konvami/api-client';
import { groupMemories } from './groups';

const TODAY = '2026-10-09';
const LENA = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const JONAS = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';

function memory(text: string, fields: Partial<Memory> = {}): Memory {
  return {
    id: text,
    kind: 'fact',
    text,
    day: null,
    partnerId: null,
    partnerName: null,
    createdAt: '2026-10-08T18:00:00Z',
    updatedAt: '2026-10-08T18:00:00Z',
    ...fields,
  };
}

const event = (text: string, day: string | null) => memory(text, { kind: 'event', day });
const shared = (text: string, partnerId: string, partnerName: string | null) =>
  memory(text, { kind: 'relationship', partnerId, partnerName });

const shape = (memories: Memory[]) =>
  groupMemories(memories, TODAY).map(({ kind, partnerName, memories: held }) => [
    kind,
    partnerName,
    held.map(({ text }) => text),
  ]);

describe('grouping what partners know', () => {
  it('has no groups when nothing is known', () => {
    expect(groupMemories([], TODAY)).toEqual([]);
  });

  it('puts dates first, then the learner’s life, then what belongs to each partner', () => {
    expect(
      shape([
        shared('Promised Lena a photo', LENA, 'Lena'),
        memory('Avoids politics', { kind: 'preference' }),
        shared('Jonas recommended a book', JONAS, 'Jonas'),
        memory('Works as a nurse'),
        event('Job interview', '2026-10-16'),
        shared('Lena has a cat', LENA, 'Lena'),
      ]),
    ).toEqual([
      ['dates', null, ['Job interview']],
      ['about', null, ['Avoids politics', 'Works as a nurse']],
      ['partner', 'Lena', ['Promised Lena a photo', 'Lena has a cat']],
      ['partner', 'Jonas', ['Jonas recommended a book']],
    ]);
  });

  it('lists what is coming up soonest first, then what is past, the latest first', () => {
    expect(
      shape([
        event('Moved to Zurich', '2026-03-01'),
        event('Trip to Hamburg', '2026-10-17'),
        event('Sister visited', '2026-10-03'),
        event('Exam', TODAY),
        event('A concert, some day', null),
      ]),
    ).toEqual([
      [
        'dates',
        null,
        ['Exam', 'Trip to Hamburg', 'Sister visited', 'Moved to Zurich', 'A concert, some day'],
      ],
    ]);
  });

  it('keeps apart two partners whose names are the same or unknown', () => {
    const groups = shape([
      shared('First', LENA, null),
      shared('Second', JONAS, null),
      shared('Third', LENA, null),
    ]);

    expect(groups).toEqual([
      ['partner', null, ['First', 'Third']],
      ['partner', null, ['Second']],
    ]);
  });

  it('gives every group a key of its own', () => {
    const keys = groupMemories(
      [
        event('Exam', TODAY),
        memory('Nurse'),
        shared('A', LENA, 'Lena'),
        shared('B', JONAS, 'Lena'),
      ],
      TODAY,
    ).map(({ key }) => key);

    expect(new Set(keys).size).toBe(4);
  });
});
