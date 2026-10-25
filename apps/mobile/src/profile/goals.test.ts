import { DEFAULT_HABIT, HABIT_MINUTES, goalLevels, habitOf, levelGoalOf } from './goals';

const profile = (fields: Record<string, unknown>) => ({
  targetLanguage: 'de',
  global: {},
  languages: {
    de: Object.fromEntries(
      Object.entries(fields).map(([field, value]) => [
        field,
        { value, source: 'asked' as const, updatedAt: '2026-10-09T12:00:00Z' },
      ]),
    ),
  },
});

describe('goals read from the profile', () => {
  it('reads the learner’s weekly habit, or the server’s suggestion when there is none', () => {
    expect(habitOf(profile({ weekly_habit: { days: 3, minutes: 30 } }))).toEqual({
      days: 3,
      minutes: 30,
      suggested: false,
    });
    expect(habitOf(profile({}))).toEqual({ ...DEFAULT_HABIT, suggested: true });
  });

  it('reads a level goal with or without its date', () => {
    expect(levelGoalOf(profile({ level_goal: { level: 'B1', by: '2027-03-31' } }))).toEqual({
      level: 'B1',
      by: '2027-03-31',
    });
    expect(levelGoalOf(profile({ level_goal: { level: 'B2', by: null } }))).toEqual({
      level: 'B2',
      by: null,
    });
    expect(levelGoalOf(profile({}))).toBeNull();
  });

  it('offers the levels above the learner’s own as goals', () => {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

    expect(goalLevels(levels, 'A2')).toEqual(['B1', 'B2', 'C1', 'C2']);
    expect(goalLevels(levels, 'A0')).toEqual(levels);
    expect(goalLevels(levels, null)).toEqual(levels);
  });

  it('offers the habit’s minutes in the server’s steps', () => {
    expect(HABIT_MINUTES.every((minutes) => minutes % 5 === 0 && minutes >= 10)).toBe(true);
    expect(HABIT_MINUTES).toContain(DEFAULT_HABIT.minutes);
  });
});
