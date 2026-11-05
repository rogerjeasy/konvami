import type { TFunction } from 'i18next';
import type { Catalog } from '@konvami/api-client';
import { courseLabel, examLabel, type ExamAnswer } from '@/onboarding/describe';
import { nativeLanguageName } from '@/onboarding/names';
import { formatDate } from '@/lib/format';

/**
 * Settings a partner changed by voice (spec §6.1.3), read back in words for the toast during
 * the call and the list on the Profile (6.14).
 */

export interface SettingContext {
  t: TFunction;
  /** The app language: dates are written in it. */
  locale: string;
  catalog: Catalog;
  /** The language being learned: the exams are its own. */
  language: string | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The name of a setting: "Explanation language". */
export function settingName(field: string, t: TFunction): string {
  // A setting this app version does not know is shown by its own name rather than as nothing.
  return t(`profile.changes.fields.${field}` as 'profile.changes.fields.exam', {
    defaultValue: field,
  });
}

/** A setting's value in words: "French", "B2 by 31 January 2027", "No exam". */
export function describeSetting(field: string, value: unknown, context: SettingContext): string {
  const { t, locale, catalog, language } = context;
  if (value === null || value === undefined) return t('profile.changes.none');
  if (field === 'explanation_language' && typeof value === 'string') {
    return nativeLanguageName(catalog, value);
  }
  if (field === 'explanation_usage' && typeof value === 'string') {
    return t(
      `onboarding.explanations.usage.${value}.label` as 'onboarding.explanations.usage.never.label',
      {
        defaultValue: value,
      },
    );
  }
  if (field === 'exam' && isObject(value)) {
    const exams = catalog.languages.find(({ code }) => code === language)?.exams;
    const exam = value as unknown as { type: string; target_level?: string; date?: string };
    const answer: ExamAnswer = { type: exam.type, targetLevel: exam.target_level, date: exam.date };
    return examLabel(answer, exams, t, locale);
  }
  if (field === 'course' && isObject(value) && typeof value.name === 'string') {
    return courseLabel({ name: value.name, chapter: value.chapter as string | undefined }, t);
  }
  if (field === 'level_goal' && isObject(value) && typeof value.level === 'string') {
    return typeof value.by === 'string'
      ? t('profile.goals.levelBy', { level: value.level, date: formatDate(locale, value.by) })
      : t('profile.goals.levelNoDate', { level: value.level });
  }
  if (field === 'weekly_habit' && isObject(value)) {
    return t('profile.goals.habitValue', {
      days: t('profile.goals.days', { count: Number(value.days) }),
      minutes: t('time.minutes', { count: Number(value.minutes) }),
    });
  }
  return String(value);
}
