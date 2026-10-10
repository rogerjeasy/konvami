/**
 * Locale-aware formatting through Intl, so no day names or number formats are hard-coded per
 * language.
 */

// 2024-01-01 was a Monday; the next six days complete the week.
const MONDAY_UTC = Date.UTC(2024, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

/** One-letter weekday names, Monday first ("M T W T F S S", "L M M J V S D"). */
export function weekdayInitials(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(MONDAY_UTC + i * DAY_MS)));
}

/** The weekday names in full, Monday first ("Monday", "Montag"), for screen readers. */
export function weekdayNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(MONDAY_UTC + i * DAY_MS)));
}

/** A 0–1 ratio as a whole percent ("68%", "68 %"). */
export function formatPercent(locale: string, ratio: number): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    ratio,
  );
}

/** Seconds as m:ss ("0:04"). */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** The twelve month names, January first ("March", "März"); `short` for narrow spaces ("Mar"). */
export function monthNames(locale: string, width: 'long' | 'short' = 'long'): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: width, timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, month) =>
    format.format(new Date(Date.UTC(2024, month, 1))),
  );
}

/** A calendar date ("2027-06-15") written in full: "June 15, 2027", "15. Juni 2027". */
export function formatDate(locale: string, isoDate: string): string {
  // Read as UTC and written as UTC, so the calendar day never shifts with the device time zone.
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

const SECONDS_PER_MINUTE = 60;

/**
 * Seconds of practice as whole minutes. Any practice at all is at least one minute, so a short
 * conversation never reads as "0 min".
 */
export function wholeMinutes(seconds: number): number {
  if (seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds / SECONDS_PER_MINUTE));
}

/** A day as a headline ("Friday 9 October", "Freitag, 9. Oktober"), on the device's calendar. */
export function formatDayLine(locale: string, date: Date): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    date,
  );
}

/** The device's calendar day of a moment, as a day count that differences can be taken of. */
function calendarDay(moment: Date): number {
  return Math.round(Date.UTC(moment.getFullYear(), moment.getMonth(), moment.getDate()) / DAY_MS);
}

/**
 * How many calendar days before `now` a moment was, on the device's calendar: 0 is today,
 * 1 yesterday, whatever the hours between them. A moment in the future counts as today.
 */
export function daysAgo(iso: string, now: Date): number {
  return Math.max(calendarDay(now) - calendarDay(new Date(iso)), 0);
}

/** A past day in a few characters ("30 Sept"); the year is added when it is not this year. */
export function formatShortDate(locale: string, iso: string, now: Date): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

/** The time of day of a moment ("14:05", "2:05 PM"), on the device's clock. */
export function formatClock(locale: string, iso: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(iso),
  );
}
