import { useTranslation } from 'react-i18next';
import type { ProfileField } from '@konvami/api-client';
import type { IconName } from '@/components/icon';
import { formatDate } from '@/lib/format';
import type { EssentialStep, StartingLevel } from './essentials';
import { languageName, nativeLanguageName } from './names';
import type { OnboardingData } from './store';

/**
 * The learner's essential answers read back in words, one row per question: for the review at
 * the end of the setup (4.3) and for the profile (6.3), where they can be changed at any time
 * (spec §6.1.3).
 */

// The exam the pack does not list (services/api: OTHER_EXAM).
const OTHER_EXAM = 'other';
// Joins the parts of one answer on a line ("English · Only when I’m stuck").
const SEPARATOR = ' · ';

export interface AnswerRow {
  step: EssentialStep;
  icon: IconName;
  /** The profile field whose source the row shows. */
  field: string;
  value: string;
  /** Further lines under the value. */
  details: string[];
}

/** A profile field of the language being learned (or a global one), as the server stored it. */
export function answerField(data: OnboardingData, field: string): ProfileField | undefined {
  const { profile } = data;
  const fields = { ...profile.global, ...profile.languages[profile.targetLanguage ?? ''] };
  return fields[field];
}

/** The level practice runs at: the one settled after the placement test, else the estimate. */
export function practiceLevel(data: OnboardingData): StartingLevel | null {
  const settled = answerField(data, 'starting_level')?.value as StartingLevel | undefined;
  return settled ?? data.essentials.selfAssessedLevel;
}

/**
 * The rows. `level` chooses which level the Level row shows: the learner's `own` estimate
 * (during the setup, before the test) or the one `practice` runs at (in the profile).
 */
export function useAnswerRows(
  data: OnboardingData,
  { level: levelKind = 'own' }: { level?: 'own' | 'practice' } = {},
): AnswerRow[] {
  const { catalog, essentials } = data;
  const { t, i18n } = useTranslation();
  const { goals, exam, course } = essentials;
  const practice = levelKind === 'practice' && answerField(data, 'starting_level') !== undefined;
  const level = practice ? practiceLevel(data) : essentials.selfAssessedLevel;
  const exams = catalog.languages.find(({ code }) => code === essentials.targetLanguage)?.exams;

  const examLine = exam
    ? [
        exam.type === OTHER_EXAM
          ? t('onboarding.goals.examOther')
          : (exams?.find(({ id }) => id === exam.type)?.name ?? exam.type),
        exam.targetLevel,
        exam.date ? formatDate(i18n.language, exam.date) : null,
      ]
        .filter(Boolean)
        .join(SEPARATOR)
    : t('onboarding.review.noExam');

  return [
    {
      step: 'language',
      icon: 'globe',
      field: 'target_language',
      value: languageName(catalog, essentials.targetLanguage ?? '', t),
      details: [],
    },
    {
      step: 'explanations',
      icon: 'message',
      field: 'explanation_language',
      value: [
        nativeLanguageName(catalog, essentials.explanationLanguage ?? ''),
        essentials.explanationUsage
          ? t(`onboarding.explanations.usage.${essentials.explanationUsage}.label`)
          : null,
      ]
        .filter(Boolean)
        .join(SEPARATOR),
      details: [],
    },
    {
      step: 'goals',
      icon: 'target',
      field: 'goals',
      value: (goals?.reasons ?? [])
        .map((reason) => t(`onboarding.goals.reasons.${reason}`))
        .join(', '),
      details: [goals?.note, examLine].filter((line): line is string => Boolean(line)),
    },
    {
      step: 'level',
      icon: 'barChart',
      field: practice ? 'starting_level' : 'self_assessed_level',
      value: level ? t(`onboarding.level.levels.${level}.label`) : '',
      details: [],
    },
    {
      step: 'course',
      icon: 'book',
      field: 'course',
      value: course
        ? [
            course.name,
            course.chapter ? t('onboarding.review.chapter', { chapter: course.chapter }) : null,
          ]
            .filter(Boolean)
            .join(SEPARATOR)
        : t('onboarding.review.noCourse'),
      details: [],
    },
  ];
}
