import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { ProfileSource } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { PressScale, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PersonaAvatar } from '@/components/persona-avatar';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { formatDate } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { firstOpenStep, type EssentialStep } from '@/onboarding/essentials';
import { OnboardingGate } from '@/onboarding/gate';
import { languageName, nativeLanguageName } from '@/onboarding/names';
import { routeForOnboarding, STEP_ROUTES } from '@/onboarding/routing';
import { useOnboardingStore } from '@/onboarding/services';
import type { OnboardingData } from '@/onboarding/store';
import { SETUP } from '@/screens/create-account/sample-content';
import { useTheme } from '@/theme';

// The exam the pack does not list (services/api: OTHER_EXAM).
const OTHER_EXAM = 'other';
// Joins the parts of one answer on a line ("English · Only when I’m stuck").
const SEPARATOR = ' · ';

interface Row {
  step: EssentialStep;
  icon: IconName;
  /** The profile field whose source the row shows. */
  field: string;
  value: string;
  /** Further lines under the value. */
  details: string[];
}

function useRows({ catalog, essentials }: OnboardingData): Row[] {
  const { t, i18n } = useTranslation();
  const { goals, exam, course } = essentials;
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
      field: 'self_assessed_level',
      value: essentials.selfAssessedLevel
        ? t(`onboarding.level.levels.${essentials.selfAssessedLevel}.label`)
        : '',
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

function sourceOf(data: OnboardingData, field: string): ProfileSource {
  const { profile } = data;
  const fields = { ...profile.global, ...profile.languages[profile.targetLanguage ?? ''] };
  return fields[field]?.source ?? 'asked';
}

function ReviewRow({
  row,
  source,
  children,
}: {
  row: Row;
  source: ProfileSource;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const title = t(`onboarding.review.items.${row.step}`);
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={t('onboarding.review.edit', { item: title })}
      accessibilityHint={[row.value, ...row.details].join('. ')}
      onPress={() => router.push({ pathname: STEP_ROUTES[row.step], params: { from: 'review' } })}
    >
      <Card className="flex-row items-start gap-3 p-3.5">
        <View
          aria-hidden
          style={{ width: size.avatarSm, height: size.avatarSm }}
          className="items-center justify-center rounded-md bg-primary-soft"
        >
          <Icon name={row.icon} color={color.primaryText} size={size.iconMd} />
        </View>
        <View className="flex-1 gap-1">
          <Text variant="overline" tone="subtle">
            {title}
          </Text>
          <Text variant="label">{row.value}</Text>
          {row.details.map((line) => (
            <Text key={line} variant="small" tone="muted">
              {line}
            </Text>
          ))}
          <View className="mt-1 self-start rounded-sm bg-surface px-1.5 py-1">
            <Text variant="badge" tone="muted">
              {t(`onboarding.source.${source}`)}
            </Text>
          </View>
          {children}
        </View>
        <Icon name="edit" color={color.fgSubtle} size={size.icon} />
      </Card>
    </PressScale>
  );
}

function ReviewBody({ data, header }: { data: OnboardingData; header: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const store = useOnboardingStore();
  const rows = useRows(data);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function confirm() {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      await store.confirmEssentials();
      const status = store.getState().data?.status;
      router.replace((status && routeForOnboarding(status)) ?? ROUTES.home);
    } catch (error) {
      setProblem(t(apiErrorKey(apiErrorCode(error))));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepLayout
      header={header}
      actions={
        <>
          {problem ? (
            <View className="pb-2">
              <NoticeBox icon="alert" tone="danger">
                {problem}
              </NoticeBox>
            </View>
          ) : null}
          <Button label={t('onboarding.review.confirm')} loading={saving} onPress={confirm} />
        </>
      }
    >
      <Reveal>
        <View className="gap-3.5">
          <PersonaAvatar look={SETUP.guide.look} diameter={size.avatarMd} />
          <View className="gap-2.5">
            <Text variant="title" accessibilityRole="header">
              {user?.firstName
                ? t('onboarding.review.title', { name: user.firstName })
                : t('onboarding.review.titleNoName')}
            </Text>
            <Text tone="muted">{t('onboarding.review.body')}</Text>
          </View>
        </View>
      </Reveal>
      <View className="gap-2.5">
        {rows.map((row, i) => (
          <Reveal key={row.step} delay={staggerDelay(i + 1)}>
            <ReviewRow row={row} source={sourceOf(data, row.field)} />
          </Reveal>
        ))}
      </View>
    </StepLayout>
  );
}

/**
 * 4.3 Review: every essential answer read back in words, each one editable, before onboarding
 * moves on (spec §6.1.3: the learner can always see and change what the app was told).
 */
export function ReviewScreen() {
  const { t } = useTranslation();
  const header = (
    <View className="min-h-tap flex-row items-center">
      <HeaderButton
        icon="chevronLeft"
        label={t('common.back')}
        onPress={() => backOr(STEP_ROUTES.course)}
      />
    </View>
  );
  return (
    <OnboardingGate header={header}>
      {(data) => {
        const open = firstOpenStep(data.status.missing);
        // A question without an answer comes before the review, wherever the learner came from.
        if (open) return <Redirect href={STEP_ROUTES[open]} />;
        return <ReviewBody data={data} header={header} />;
      }}
    </OnboardingGate>
  );
}
