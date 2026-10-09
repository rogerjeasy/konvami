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
