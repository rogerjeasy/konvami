import type { Persona, PersonaDraft } from '@konvami/api-client';
import {
  AGE_MAX,
  AGE_MIN,
  blankDraft,
  draftOf,
  draftProblems,
  ROLE_TEACHING,
  tidy,
  withRole,
} from './persona-draft';

const GRETA: PersonaDraft = {
  role: 'teacher',
  name: 'Greta',
  gender: 'female',
  age: 30,
  origin: 'Hamburg',
  occupation: 'Marketing-Managerin',
  tagline: null,
  backstory: 'Greta segelt jedes Wochenende.',
  look: {
    skin: 'honey',
    hair: 'bob',
    hairColor: 'auburn',
    top: 'amber',
    backdrop: 'sand',
    glasses: true,
    beard: false,
  },
  voice: 'coral',
  personality: {
    warmth: 5,
    playfulness: 2,
    talkativeness: 4,
    curiosity: 3,
    humour: 1,
    formOfAddress: 'formal',
    style: 'stories',
  },
  teaching: {
    correctionTiming: 'immediate',
    strictness: 'important',
    explanationUsage: null,
    level: null,
    focus: null,
    speed: null,
  },
};

describe('a blank draft', () => {
  it('starts as a friend in the middle of every scale, who teaches as friends do', () => {
    const draft = blankDraft();

    expect(draft.role).toBe('buddy');
    expect(draft.name).toBe('');
    expect(draft.personality).toEqual({
      warmth: 3,
      playfulness: 3,
      talkativeness: 3,
      curiosity: 3,
      humour: 3,
      formOfAddress: 'auto',
      style: 'questions',
    });
    expect(draft.teaching).toMatchObject({ correctionTiming: 'recast', strictness: 'meaning' });
  });

  it('cannot be saved until it says who the partner is', () => {
    expect(draftProblems(blankDraft())).toEqual(['name', 'origin', 'backstory']);
  });
});

describe('a draft made from a partner', () => {
  it('carries everything but the id', () => {
    const persona: Persona = { id: '7b1c2f0e-6c1b-4a8e-9a55-0d2f6a1c9e11', ...GRETA };

    expect(draftOf(persona)).toEqual(GRETA);
  });
});

describe('changing the role', () => {
  it('takes on the new role’s way of correcting when the old role’s way was untouched', () => {
    const coach = withRole(GRETA, 'exam_coach');

    expect(coach.role).toBe('exam_coach');
    expect(coach.teaching).toMatchObject({ correctionTiming: 'end', strictness: 'important' });
  });

  it('keeps a way of correcting the learner chose themselves', () => {
    const strict: PersonaDraft = {
      ...GRETA,
      teaching: { ...GRETA.teaching, correctionTiming: 'off' },
    };

    expect(withRole(strict, 'buddy').teaching.correctionTiming).toBe('off');
  });

  it('keeps the other teaching settings either way', () => {
    const focused: PersonaDraft = {
      ...GRETA,
      teaching: { ...GRETA.teaching, focus: 'Dativ', speed: 0.9, level: 'B1' },
    };

    expect(withRole(focused, 'buddy').teaching).toEqual({
      ...ROLE_TEACHING.buddy,
      focus: 'Dativ',
      speed: 0.9,
      level: 'B1',
    });
  });
});

describe('what is missing from a draft', () => {
  it('is nothing for a complete one', () => {
    expect(draftProblems(GRETA)).toEqual([]);
  });

  it.each([
    [{ name: '   ' }, 'name'],
    [{ origin: '' }, 'origin'],
    [{ backstory: ' ' }, 'backstory'],
    [{ age: AGE_MIN - 1 }, 'age'],
    [{ age: AGE_MAX + 1 }, 'age'],
    [{ age: Number.NaN }, 'age'],
  ] as const)('names the field for %j', (change, field) => {
    expect(draftProblems({ ...GRETA, ...change })).toEqual([field]);
  });
});

describe('a draft made ready to save', () => {
  it('loses the spaces around what was typed, and empty optional lines become none', () => {
    const typed: PersonaDraft = {
      ...GRETA,
      name: '  Greta ',
      origin: ' Hamburg  ',
      occupation: '  ',
      tagline: '   ',
      backstory: ' Greta segelt. ',
      teaching: { ...GRETA.teaching, focus: '  ' },
    };

    expect(tidy(typed)).toEqual({
      ...GRETA,
      occupation: '',
      backstory: 'Greta segelt.',
      teaching: { ...GRETA.teaching, focus: null },
    });
  });

  it('keeps optional lines that say something', () => {
    const typed: PersonaDraft = {
      ...GRETA,
      tagline: ' Loves sailing ',
      teaching: { ...GRETA.teaching, focus: ' Dativ ' },
    };

    expect(tidy(typed)).toMatchObject({ tagline: 'Loves sailing', teaching: { focus: 'Dativ' } });
  });
});
