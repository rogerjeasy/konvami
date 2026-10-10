import type {
  Persona,
  PersonaDraft,
  PersonaLook,
  PersonaPersonality,
  PersonaRole,
  PersonaTeaching,
  PersonaVoice,
} from '@konvami/api-client';

/**
 * Persona Studio's working copy of a partner (spec §6.2): everything that can be decided about
 * them, before it is saved. The limits and defaults here are the server's
 * (services/api: domain/personas.py), repeated so the form can say what is missing before
 * anything is sent.
 */

export const NAME_MAX = 40;
export const ORIGIN_MAX = 60;
export const OCCUPATION_MAX = 80;
export const TAGLINE_MAX = 120;
export const BACKSTORY_MAX = 600;
export const FOCUS_MAX = 120;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 500;
/** The most partners a learner has per language. */
export const MAX_PARTNERS = 12;
export const AGE_MIN = 18;
export const AGE_MAX = 80;
/** A new partner's age until the learner says otherwise. */
const AGE_DEFAULT = 30;

/** The personality traits, each a scale from 1 to 5 between two poles. */
export const TRAITS = ['warmth', 'playfulness', 'talkativeness', 'curiosity', 'humour'] as const;
export type Trait = (typeof TRAITS)[number];
export const TRAIT_STEPS = [1, 2, 3, 4, 5] as const;

export const ROLES: readonly PersonaRole[] = ['buddy', 'teacher', 'exam_coach'];
export const GENDERS: readonly Persona['gender'][] = ['female', 'male'];
export const VOICES: readonly PersonaVoice[] = [
  'marin',
  'coral',
  'sage',
  'shimmer',
  'cedar',
  'ash',
  'echo',
  'verse',
];
export const FORMS_OF_ADDRESS: readonly PersonaPersonality['formOfAddress'][] = [
  'auto',
  'informal',
  'formal',
];
export const STYLES: readonly PersonaPersonality['style'][] = ['questions', 'stories', 'debate'];
export const CORRECTION_TIMINGS: readonly PersonaTeaching['correctionTiming'][] = [
  'recast',
  'immediate',
  'end',
  'off',
];
export const STRICTNESSES: readonly PersonaTeaching['strictness'][] = [
  'meaning',
  'important',
  'everything',
];
/** Speaking speeds on offer; null is the voice's own pace. */
export const SPEEDS: readonly (number | null)[] = [null, 0.8, 0.9, 1, 1.1];

const BALANCED: PersonaPersonality = {
  warmth: 3,
  playfulness: 3,
  talkativeness: 3,
  curiosity: 3,
  humour: 3,
  formOfAddress: 'auto',
  style: 'questions',
};

const AS_THE_PROFILE_SAYS = { explanationUsage: null, level: null, focus: null, speed: null };

/** How each role treats mistakes until the learner decides otherwise. */
export const ROLE_TEACHING: Record<PersonaRole, PersonaTeaching> = {
  buddy: { correctionTiming: 'recast', strictness: 'meaning', ...AS_THE_PROFILE_SAYS },
  teacher: { correctionTiming: 'immediate', strictness: 'important', ...AS_THE_PROFILE_SAYS },
  exam_coach: { correctionTiming: 'end', strictness: 'important', ...AS_THE_PROFILE_SAYS },
};

const DEFAULT_LOOK: PersonaLook = {
  skin: 'sand',
  hair: 'short',
  hairColor: 'chestnut',
  top: 'teal',
  backdrop: 'mist',
  glasses: false,
  beard: false,
};

/** A partner started from scratch: a friend, with who they are still to be written. */
export function blankDraft(): PersonaDraft {
  return {
    role: 'buddy',
    name: '',
    gender: 'female',
    age: AGE_DEFAULT,
    origin: '',
    occupation: '',
    tagline: null,
    backstory: '',
    look: DEFAULT_LOOK,
    voice: 'marin',
    personality: BALANCED,
    teaching: ROLE_TEACHING.buddy,
  };
}

/** A partner as a draft to change: everything but their id. */
export function draftOf(persona: Persona): PersonaDraft {
  // The id is taken out, the rest is the draft.
  const { id: _id, ...draft } = persona;
  return draft;
}

/**
 * The draft with another role. The way of correcting follows the role while it is still the
 * old role's usual one; a way the learner chose themselves stays.
 */
export function withRole(draft: PersonaDraft, role: PersonaRole): PersonaDraft {
  const usual = ROLE_TEACHING[draft.role];
  const untouched =
    draft.teaching.correctionTiming === usual.correctionTiming &&
    draft.teaching.strictness === usual.strictness;
  if (!untouched) return { ...draft, role };
  const { correctionTiming, strictness } = ROLE_TEACHING[role];
  return { ...draft, role, teaching: { ...draft.teaching, correctionTiming, strictness } };
}

export type DraftProblem = 'name' | 'age' | 'origin' | 'backstory';

/** What a draft still needs before it can be saved, in the order the studio asks for it. */
export function draftProblems(draft: PersonaDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (!draft.name.trim()) problems.push('name');
  if (!(draft.age >= AGE_MIN && draft.age <= AGE_MAX)) problems.push('age');
  if (!draft.origin.trim()) problems.push('origin');
  if (!draft.backstory.trim()) problems.push('backstory');
  return problems;
}

/** The draft as it is saved: without the spaces around what was typed, and with an optional
 * line that says nothing left out. */
export function tidy(draft: PersonaDraft): PersonaDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    origin: draft.origin.trim(),
    occupation: draft.occupation.trim(),
    tagline: draft.tagline?.trim() || null,
    backstory: draft.backstory.trim(),
    teaching: { ...draft.teaching, focus: draft.teaching.focus?.trim() || null },
  };
}
