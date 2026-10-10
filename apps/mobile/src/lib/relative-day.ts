import type { TFunction } from 'i18next';
import { daysAgo, formatShortDate } from './format';

// Up to this many days back a day reads as a count ("3 days ago"); further back, as its date.
const COUNTED_DAYS = 6;

function counted(t: TFunction, days: number): string | null {
  if (days === 0) return t('time.today');
  if (days === 1) return t('time.yesterday');
  return days <= COUNTED_DAYS ? t('time.daysAgo', { count: days }) : null;
}

/**
 * A past day as it reads inside a sentence: "today", "yesterday", "3 days ago", "on 30 Sept".
 * Days are the device's calendar days (see `daysAgo`).
 */
export function relativeDayPhrase(t: TFunction, locale: string, iso: string, now: Date): string {
  return (
    counted(t, daysAgo(iso, now)) ?? t('time.onDate', { date: formatShortDate(locale, iso, now) })
  );
}

/** A past day standing on its own, as in a list: "Today", "Yesterday", "3 days ago", "30 Sept". */
export function relativeDayLabel(t: TFunction, locale: string, iso: string, now: Date): string {
  const text = counted(t, daysAgo(iso, now)) ?? formatShortDate(locale, iso, now);
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}
