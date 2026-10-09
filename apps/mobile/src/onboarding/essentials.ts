import type { Catalog, Profile } from '@konvami/api-client';

/**
 * The essential onboarding answers (spec §6.1.1 step 3) as the app uses them. The API stores a
 * profile as loosely typed fields; this is the typed view of the ones the form asks for.
 */
export type StartingLevel = Catalog['startingLevels'][number];
export type CefrLevel = Catalog['examLevels'][number];
export type GoalReason = Catalog['goalReasons'][number];
export type ExplanationUsage = Catalog['explanationUsages'][number];

export interface Goals {
  reasons: GoalReason[];
  note: string | null;
}

export interface Exam {
  /** An exam id from the language pack, or `other`. */
  type: string;
  targetLevel: CefrLevel | null;
  /** ISO date (2027-06-15), or null when not booked yet. */
  date: string | null;
}

export interface Course {
  name: string;
  chapter: string | null;
}

export interface Essentials {
  targetLanguage: string | null;
  explanationLanguage: string | null;
  explanationUsage: ExplanationUsage | null;
  goals: Goals | null;
  /** `undefined`: not answered yet. `null`: answered, no exam. */
  exam: Exam | null | undefined;
  selfAssessedLevel: StartingLevel | null;
  /** `undefined`: not answered yet. `null`: answered, no course. */
  course: Course | null | undefined;
}

const STARTING_LEVELS: readonly StartingLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const CEFR_LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const GOAL_REASONS: readonly GoalReason[] = [
  'travel',
  'work',
  'study',
  'exam',
  'living_abroad',
  'family_friends',
  'culture',
  'other',
];
const EXPLANATION_USAGES: readonly ExplanationUsage[] = [
  'never',
  'when_stuck',
  'for_grammar',
  'freely',
];

const oneOf = <T extends string>(options: readonly T[], value: unknown): T | null =>
  options.includes(value as T) ? (value as T) : null;

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

function goalsOf(value: unknown): Goals | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.reasons)) return null;
  const reasons = raw.reasons.filter((reason): reason is GoalReason =>
    GOAL_REASONS.includes(reason as GoalReason),
  );
  return reasons.length ? { reasons, note: text(raw.note) } : null;
}

function examOf(value: unknown): Exam | null | undefined {
  if (value === null) return null;
  const raw = record(value);
  const type = text(raw?.type);
  if (!raw || !type) return undefined;
  return { type, targetLevel: oneOf(CEFR_LEVELS, raw.target_level), date: text(raw.date) };
}

function courseOf(value: unknown): Course | null | undefined {
  if (value === null) return null;
  const raw = record(value);
  const name = text(raw?.name);
  if (!raw || !name) return undefined;
  return { name, chapter: text(raw.chapter) };
}

/** The essential answers for the language being learned. A malformed value counts as unanswered. */
export function essentialsOf(profile: Profile): Essentials {
  const language = profile.targetLanguage;
  const fields = (language && profile.languages[language]) || {};
  const value = (name: string): unknown => fields[name]?.value;
  return {
    targetLanguage: language,
    explanationLanguage: text(value('explanation_language')),
    explanationUsage: oneOf(EXPLANATION_USAGES, value('explanation_usage')),
    goals: goalsOf(value('goals')),
    exam: examOf(value('exam')),
    selfAssessedLevel: oneOf(STARTING_LEVELS, value('self_assessed_level')),
    course: courseOf(value('course')),
  };
}

/** The form's steps, in order. */
export const ESSENTIAL_STEPS = ['language', 'explanations', 'goals', 'level', 'course'] as const;
export type EssentialStep = (typeof ESSENTIAL_STEPS)[number];

/** The step that asks each profile field. */
const STEP_OF_FIELD: Record<string, EssentialStep> = {
  target_language: 'language',
  explanation_language: 'explanations',
  explanation_usage: 'explanations',
  goals: 'goals',
  exam: 'goals',
  self_assessed_level: 'level',
  course: 'course',
};

/** The first step with an open question, given the fields the server still misses. */
export function firstOpenStep(missing: readonly string[]): EssentialStep | null {
  const open = new Set(missing.map((field) => STEP_OF_FIELD[field]));
  return ESSENTIAL_STEPS.find((step) => open.has(step)) ?? null;
}

/**
 * The topics of the spoken setup, in asking order. The guide asks about the exam separately from
 * the goals, so there are six where the form has five steps (services/api: domain/host.py).
 */
export const SETUP_TOPICS = [
  'language',
  'explanations',
  'goals',
  'exam',
  'level',
  'course',
] as const;
export type SetupTopic = (typeof SETUP_TOPICS)[number];

const TOPIC_OF_FIELD: Record<string, SetupTopic> = {
  target_language: 'language',
  explanation_language: 'explanations',
  explanation_usage: 'explanations',
  goals: 'goals',
  exam: 'exam',
  self_assessed_level: 'level',
  course: 'course',
};

/** The topics still open, given the fields the server still misses. */
export function openTopics(missing: readonly string[]): SetupTopic[] {
  const open = new Set(missing.map((field) => TOPIC_OF_FIELD[field]));
  return SETUP_TOPICS.filter((topic) => open.has(topic));
}
