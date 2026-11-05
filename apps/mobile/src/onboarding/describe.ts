import type { TFunction } from 'i18next';
import type { CatalogExam } from '@konvami/api-client';
import { formatDate } from '@/lib/format';

/**
 * Stored answers read back in words, for the review of the setup (4.3), the profile (6.3) and
 * the list of changes made by voice (6.14).
 */

// The exam the pack does not list (services/api: OTHER_EXAM).
const OTHER_EXAM = 'other';
// Joins the parts of one answer on a line ("English · Only when I’m stuck").
export const SEPARATOR = ' · ';

export interface ExamAnswer {
  type: string;
  targetLevel?: string | null;
  date?: string | null;
}

/** An exam as a line: "Goethe-Zertifikat · B1 · 14 June 2027". */
export function examLabel(
  exam: ExamAnswer,
  exams: readonly CatalogExam[] | undefined,
  t: TFunction,
  locale: string,
): string {
  return [
    exam.type === OTHER_EXAM
      ? t('onboarding.goals.examOther')
      : (exams?.find(({ id }) => id === exam.type)?.name ?? exam.type),
    exam.targetLevel,
    exam.date ? formatDate(locale, exam.date) : null,
  ]
    .filter(Boolean)
    .join(SEPARATOR);
}

/** A course as a line: "Menschen A2 · chapter 7". */
export function courseLabel(
  course: { name: string; chapter?: string | null },
  t: TFunction,
): string {
  return [
    course.name,
    course.chapter ? t('onboarding.review.chapter', { chapter: course.chapter }) : null,
  ]
    .filter(Boolean)
    .join(SEPARATOR);
}
