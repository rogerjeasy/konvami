import type { TFunction } from 'i18next';
import { dueDay } from '@/lib/card-times';

/**
 * When a card is due, in words: "due now", "later today", "tomorrow", "in 3 days". With
 * `standalone` it starts with a capital, for a place where it does not sit inside a sentence.
 */
export function dueLabel(
  t: TFunction,
  locale: string,
  dueAt: string,
  now: Date,
  standalone = false,
): string {
  const due = dueDay(dueAt, now);
  const text =
    due.when === 'days' ? t('learn.due.days', { count: due.count }) : t(`learn.due.${due.when}`);
  return standalone ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : text;
}
