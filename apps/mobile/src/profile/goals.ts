import type { Profile } from '@konvami/api-client';

/** The weekly habit of a learner who set none (services/api: domain/director.py DEFAULT_HABIT). */
export const DEFAULT_HABIT = { days: 4, minutes: 40 } as const;
/**
 * The minutes a week the form offers: from one short call a week to two hours, in the server's
 * steps of five (services/api: domain/profile.py HABIT_MINUTES_STEP).
 */
export const HABIT_MINUTES = [20, 30, 40, 60, 90, 120] as const;
export const HABIT_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export interface Habit {
  days: number;
  minutes: number;
  /** Nothing was set: this is the plan's suggestion. */
  suggested: boolean;
}

export interface LevelGoal {
  level: string;
  /** The day to reach it by ("2027-03-31"); null without a date. */
  by: string | null;
}

function valueOf(profile: Profile, field: string): unknown {
  return profile.languages[profile.targetLanguage ?? '']?.[field]?.value ?? null;
}

export function habitOf(profile: Profile): Habit {
  const stored = valueOf(profile, 'weekly_habit') as { days: number; minutes: number } | null;
  return stored ? { ...stored, suggested: false } : { ...DEFAULT_HABIT, suggested: true };
}

export function levelGoalOf(profile: Profile): LevelGoal | null {
  const stored = valueOf(profile, 'level_goal') as { level: string; by: string | null } | null;
  return stored ? { level: stored.level, by: stored.by ?? null } : null;
}

/** The levels a goal can name: those above the learner's own, or all of them. */
export function goalLevels<Level extends string>(
  levels: readonly Level[],
  own: string | null,
): readonly Level[] {
  const at = levels.indexOf(own as Level);
  return at < 0 ? levels : levels.slice(at + 1);
}
