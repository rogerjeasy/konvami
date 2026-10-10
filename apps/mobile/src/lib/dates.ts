/**
 * Calendar dates as the user picks them on the date wheels, as pure functions. A calendar date
 * has no time and no time zone: 15 June is 15 June wherever the phone is.
 */

/** A calendar date; month is 1–12. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export type DatePart = keyof CalendarDate;

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2027-06-05", the form the API stores. */
export function toIsoDate({ year, month, day }: CalendarDate): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function fromIsoDate(text: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const real = month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
  return real ? { year, month, day } : null;
}

export function calendarDateOf(date: Date): CalendarDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

const isBefore = (a: CalendarDate, b: CalendarDate) => toIsoDate(a) < toIsoDate(b);

/** The same day `count` months later, moved back into the month when it is shorter. */
export function addMonths(date: CalendarDate, count: number): CalendarDate {
  const index = date.year * 12 + (date.month - 1) + count;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

const range = (from: number, to: number) =>
  Array.from({ length: Math.max(to - from + 1, 0) }, (_, i) => from + i);

/** What each wheel offers for the current date: nothing before `min`, years within `years`. */
export function dateChoices(
  value: CalendarDate,
  { years, min }: { years: { from: number; to: number }; min?: CalendarDate },
): { days: number[]; months: number[]; years: number[] } {
  const firstYear = min && value.year === min.year;
  const firstMonth = firstYear && value.month === min.month;
  return {
    days: range(firstMonth ? min.day : 1, daysInMonth(value.year, value.month)),
    months: range(firstYear ? min.month : 1, 12),
    years: range(years.from, years.to),
  };
}

/** `value` with one part changed: the day stays inside the month, and never before `min`. */
export function withDatePart(
  value: CalendarDate,
  part: DatePart,
  to: number,
  min?: CalendarDate,
): CalendarDate {
  const changed = { ...value, [part]: to };
  const next = { ...changed, day: Math.min(changed.day, daysInMonth(changed.year, changed.month)) };
  return min && isBefore(next, min) ? min : next;
}
