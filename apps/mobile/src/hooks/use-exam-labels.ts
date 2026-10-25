import { useTranslation } from 'react-i18next';
import type { ExamPartKind } from '@konvami/api-client';
import { formatPercent } from '@/lib/format';

// The criteria a part is scored by (services/api: domain/exams.py CRITERIA).
export const CRITERIA = ['task', 'coherence', 'vocabulary', 'grammar'] as const;
export type Criterion = (typeof CRITERIA)[number];
// The most points a criterion gives (services/api: domain/exams.py MAX_MARK).
export const MAX_MARK = 4;

/** How the exam screens and Today name a part, a criterion and a score. */
export function useExamLabels() {
  const { t, i18n } = useTranslation();
  const kind = (part: ExamPartKind) => t(`exams.kinds.${part}`);
  const part = (index: number, kindOf: ExamPartKind) =>
    t('exams.part', { number: index + 1, kind: kind(kindOf) });
  return {
    kind,
    /** "Part 2 · Present a topic", from the part's place (0 is the first). */
    part,
    /** "Weakest lately: Part 2 · Present a topic". */
    weakest: (index: number, kindOf: ExamPartKind) =>
      t('exams.readiness.weakest', { part: part(index, kindOf) }),
    criterion: (criterion: Criterion) => t(`exams.result.criteria.${criterion}`),
    percent: (share: number) => formatPercent(i18n.language, share),
    /** Whole minutes, for a part's time or a test's length. */
    minutes: (seconds: number) => t('time.minutes', { count: Math.round(seconds / 60) }),
  };
}
