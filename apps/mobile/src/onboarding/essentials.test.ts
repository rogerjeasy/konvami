import type { Profile } from '@konvami/api-client';
import { essentialsOf, firstOpenStep, openTopics, SETUP_TOPICS } from './essentials';

const field = (value: unknown) => ({
  value,
  source: 'asked' as const,
  updatedAt: '2026-10-09T12:00:00Z',
});

function profile(german: Record<string, unknown>, targetLanguage: string | null = 'de'): Profile {
  return {
    targetLanguage,
    global: targetLanguage ? { target_language: field(targetLanguage) } : {},
    languages: {
      de: Object.fromEntries(Object.entries(german).map(([name, value]) => [name, field(value)])),
    },
  };
}

describe('essentialsOf', () => {
  it('has nothing for a new learner', () => {
    expect(essentialsOf({ targetLanguage: null, global: {}, languages: {} })).toEqual({
      targetLanguage: null,
      explanationLanguage: null,
      explanationUsage: null,
      goals: null,
      exam: undefined,
      selfAssessedLevel: null,
      course: undefined,
    });
  });

  it('reads every answer of the language being learned', () => {
    const essentials = essentialsOf(
      profile({
        explanation_language: 'fr',
        explanation_usage: 'for_grammar',
        goals: { reasons: ['work', 'exam'], note: 'Job in Zürich' },
        exam: { type: 'goethe', target_level: 'B1', date: '2027-06-15' },
        self_assessed_level: 'A2',
        course: { name: 'Menschen A2', chapter: '5' },
      }),
    );

    expect(essentials).toEqual({
      targetLanguage: 'de',
      explanationLanguage: 'fr',
      explanationUsage: 'for_grammar',
      goals: { reasons: ['work', 'exam'], note: 'Job in Zürich' },
      exam: { type: 'goethe', targetLevel: 'B1', date: '2027-06-15' },
      selfAssessedLevel: 'A2',
      course: { name: 'Menschen A2', chapter: '5' },
    });
  });

  it('tells "no exam" and "no course" apart from questions not answered yet', () => {
    const answered = essentialsOf(profile({ exam: null, course: null }));
    const open = essentialsOf(profile({}));

    expect([answered.exam, answered.course]).toEqual([null, null]);
    expect([open.exam, open.course]).toEqual([undefined, undefined]);
  });

  it('ignores answers that belong to another language', () => {
    const other: Profile = {
      targetLanguage: 'de',
      global: {},
      languages: { fr: { self_assessed_level: field('B2') } },
    };

    expect(essentialsOf(other).selfAssessedLevel).toBeNull();
  });

  it.each([
    ['explanation_usage', 'sometimes', 'explanationUsage', null],
    ['self_assessed_level', 7, 'selfAssessedLevel', null],
    ['goals', { reasons: 'work' }, 'goals', null],
    ['exam', { target_level: 'B1' }, 'exam', undefined],
    ['course', { chapter: '5' }, 'course', undefined],
  ])('treats a malformed %s as not answered', (name, value, key, expected) => {
    expect(essentialsOf(profile({ [name]: value }))[key as 'goals']).toBe(expected);
  });
});

describe('firstOpenStep', () => {
  it.each([
    [['target_language', 'explanation_language', 'goals'], 'language'],
    [['explanation_usage', 'goals'], 'explanations'],
    [['exam', 'course'], 'goals'],
    [['self_assessed_level', 'course'], 'level'],
    [['course'], 'course'],
  ])('for %j it is the %s step', (missing, step) => {
    expect(firstOpenStep(missing)).toBe(step);
  });

  it('is nothing when every question has an answer', () => {
    expect(firstOpenStep([])).toBeNull();
  });

  it('skips a question it does not know, so a newer server cannot trap the form', () => {
    expect(firstOpenStep(['favourite_colour', 'course'])).toBe('course');
  });
});

describe('openTopics', () => {
  it('lists the topics of the spoken setup in the order they are asked', () => {
    expect(SETUP_TOPICS).toEqual(['language', 'explanations', 'goals', 'exam', 'level', 'course']);
  });

  it('counts a topic as open while any of its answers is missing', () => {
    expect(openTopics(['explanation_usage', 'exam', 'course'])).toEqual([
      'explanations',
      'exam',
      'course',
    ]);
  });

  it('has nothing open when nothing is missing', () => {
    expect(openTopics([])).toEqual([]);
  });
});
