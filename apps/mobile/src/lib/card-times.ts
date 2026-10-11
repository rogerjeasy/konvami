import { daysUntil } from './format';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// For a wait, a month is thirty days and a year 365: "5 months" is a size, not a date.
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** How long until a card comes back, in the unit a person would say it in. */
export interface Wait {
  unit: 'minutes' | 'hours' | 'days' | 'months' | 'years';
  count: number;
}

/** Reads a wait given in seconds ("10 minutes", "2 days", "5 months"); never less than 1. */
export function waitOf(seconds: number): Wait {
  const [unit, size] =
    (
      [
        ['years', YEAR],
        ['months', MONTH],
        ['days', DAY],
        ['hours', HOUR],
      ] as const
    ).find(([, least]) => seconds >= least) ?? (['minutes', MINUTE] as const);
  return { unit, count: Math.max(1, Math.round(seconds / size)) };
}

/** When a card is due, as the learner's calendar has it. */
export type DueDay =
  | { when: 'now' }
  /** Later today. */
  | { when: 'today' }
  | { when: 'tomorrow' }
  | { when: 'days'; count: number };

export function dueDay(dueAt: string, now: Date): DueDay {
  if (Date.parse(dueAt) <= now.getTime()) return { when: 'now' };
  const days = daysUntil(dueAt, now);
  if (days === 0) return { when: 'today' };
  return days === 1 ? { when: 'tomorrow' } : { when: 'days', count: days };
}
