import type { WeekPlan } from '@konvami/api-client';
import { calendarDateOf, toIsoDate } from '@/lib/dates';

/**
 * Practice reminders (spec §6.18), worked out on the device from this week's plan. They are
 * scheduled for the next seven days each time Today opens, so a learner who stops opening the
 * app stops being reminded after a week, and one who practises today hears nothing more today.
 */

/** What the learner chose about reminders on this device. */
export interface ReminderSettings {
  on: boolean;
  /** The time of day reminders come at, on the device's clock ("18:00"). */
  time: string;
  /** Whether a day without practice may remind of the cards that are waiting. */
  cards: boolean;
}

// Reminders come at the learner's time, never at night: the times they can choose.
export const REMINDER_TIMES = [
  '07:00',
  '08:00',
  '12:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
];
export const DEFAULT_REMINDERS: ReminderSettings = { on: true, time: '18:00', cards: true };

// How far ahead reminders are scheduled.
const DAYS_AHEAD = 7;

export type ReminderKind =
  // Today, with today's plan.
  | 'today'
  // A planned day ahead.
  | 'practice'
  // A planned day this week with a simulation still to do, or today when it starts with one.
  | 'simulation'
  // A day without practice planned, while cards are waiting.
  | 'cards';

export interface Reminder {
  /** One per day, so a new schedule replaces the old one. */
  id: string;
  at: Date;
  kind: ReminderKind;
  /** Today's planned minutes, for a reminder of today. */
  minutes?: number;
}

/** "18:00" on the given day, on the device's clock. */
function atTime(day: Date, time: string): Date {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
}

function addDays(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
}

/**
 * The reminders of the next seven days: at most one a day, at the learner's time, none at a
 * time already gone. A planned day reminds to practise; the week's next planned day names a
 * simulation still to do; the first day without practice reminds of waiting cards. Today is
 * left out once the learner practised or today's plan is done, and the rest of a week that is
 * done, or out of voice minutes, waits for next week.
 */
export function upcomingReminders({
  now,
  plan,
  cardsDue,
  practisedToday,
  settings,
}: {
  now: Date;
  plan: WeekPlan;
  cardsDue: number;
  practisedToday: boolean;
  settings: ReminderSettings;
}): Reminder[] {
  if (!settings.on) return [];
  const today = toIsoDate(calendarDateOf(now));
  // ISO dates compare like the days they name.
  const sunday = toIsoDate(calendarDateOf(addDays(new Date(`${plan.week}T00:00:00`), 6)));
  const weekOver = plan.reason === 'week_done' || plan.reason === 'minutes_used_up';
  const planned = new Set(plan.upcoming);
  let simulationLeft = plan.exam !== null && plan.exam.simulations > plan.exam.done;
  let cardsLeft = settings.cards && cardsDue > 0;

  const reminders: Reminder[] = [];
  for (let offset = 0; offset < DAYS_AHEAD; offset += 1) {
    const date = addDays(now, offset);
    const day = toIsoDate(calendarDateOf(date));
    const at = atTime(date, settings.time);
    if (at <= now) continue;
    const isToday = day === today;
    if (isToday && practisedToday) continue;
    const id = `reminder-${day}`;
    const thisWeek = day <= sunday;
    const practice = isToday ? plan.today.length > 0 : planned.has(day);
    if (practice && !(thisWeek && weekOver)) {
      const simulation = isToday ? plan.today[0]?.kind === 'exam' : thisWeek && simulationLeft;
      if (simulation) simulationLeft = false;
      const kind: ReminderKind = simulation ? 'simulation' : isToday ? 'today' : 'practice';
      const minutes = plan.today.reduce((sum, session) => sum + session.minutes, 0);
      reminders.push(isToday ? { id, at, kind, minutes } : { id, at, kind });
    } else if (cardsLeft) {
      cardsLeft = false;
      reminders.push({ id, at, kind: 'cards' });
    }
  }
  return reminders;
}
