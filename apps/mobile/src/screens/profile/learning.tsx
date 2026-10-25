import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AnswerCard } from '@/components/answer-card';
import { Reveal } from '@/components/motion';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { habitOf, levelGoalOf } from '@/profile/goals';
import { formatDate } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { answerField, useAnswerRows } from '@/onboarding/answers';
import { OnboardingGate } from '@/onboarding/gate';
import { STEP_ROUTES } from '@/onboarding/routing';
import type { OnboardingData } from '@/onboarding/store';

// The calendar day of a stored moment ("2026-10-09T12:00:00Z" → "2026-10-09").
const DAY_LENGTH = 'YYYY-MM-DD'.length;

/** The goals the week's plan follows, each opening the goals screen. */
function Goals({ data }: { data: OnboardingData }) {
  const { t, i18n } = useTranslation();
  const habit = habitOf(data.profile);
  const goal = levelGoalOf(data.profile);
  const habitTitle = t('profile.goals.habit');
  const levelTitle = t('profile.goals.level');
  const open = () => router.push(ROUTES.accountGoals);
  return (
    <View className="gap-2.5">
      <Text variant="overline" tone="subtle" accessibilityRole="header">
        {t('profile.learningScreen.goals')}
      </Text>
      <AnswerCard
        icon="calendar"
        title={habitTitle}
        value={t('profile.goals.habitValue', {
          days: t('profile.goals.days', { count: habit.days }),
          minutes: t('time.minutes', { count: habit.minutes }),
        })}
        source={habit.suggested ? t('profile.goals.suggested') : t('onboarding.source.asked')}
        editLabel={t('profile.learningScreen.edit', { item: habitTitle })}
        onPress={open}
      />
      <AnswerCard
        icon="target"
        title={levelTitle}
        value={
          goal
            ? goal.by
              ? t('profile.goals.levelBy', {
                  level: goal.level,
                  date: formatDate(i18n.language, goal.by),
                })
              : t('profile.goals.levelNoDate', { level: goal.level })
            : t('profile.goals.noLevel')
        }
        source={goal ? t('onboarding.source.asked') : undefined}
        editLabel={t('profile.learningScreen.edit', { item: levelTitle })}
        onPress={open}
      />
    </View>
  );
}

function Answers({ data }: { data: OnboardingData }) {
  const { t, i18n } = useTranslation();
  const rows = useAnswerRows(data, { level: 'practice' });
  return (
    <View className="gap-2.5">
      {rows.map((row, i) => {
        const field = answerField(data, row.field);
        const title = t(`onboarding.review.items.${row.step}`);
        return (
          <Reveal key={row.step} delay={staggerDelay(i + 1)}>
            <AnswerCard
              icon={row.icon}
              title={title}
              value={row.value}
              details={row.details}
              source={t(`onboarding.source.${field?.source ?? 'asked'}`)}
              note={
                field
                  ? t('profile.learningScreen.changed', {
                      date: formatDate(i18n.language, field.updatedAt.slice(0, DAY_LENGTH)),
                    })
                  : undefined
              }
              editLabel={t('profile.learningScreen.edit', { item: title })}
              onPress={() =>
                router.push({ pathname: STEP_ROUTES[row.step], params: { from: 'profile' } })
              }
            />
          </Reveal>
        );
      })}
    </View>
  );
}

/**
 * 6.3 Learning (spec §6.1.3, §14.2 "My profile"): everything the app was told about the
 * learner's learning, read back in words, each with where it came from and when it last
 * changed. A row opens the question it answers.
 */
export function LearningScreen() {
  const { t } = useTranslation();
  const header = (
    <View className="min-h-tap flex-row items-center">
      <HeaderButton
        icon="chevronLeft"
        label={t('common.back')}
        onPress={() => backOr(ROUTES.account)}
      />
    </View>
  );
  return (
    <OnboardingGate header={header}>
      {(data) => (
        <StepLayout header={header}>
          <Reveal>
            <View className="gap-2.5">
              <Text variant="title" accessibilityRole="header">
                {t('profile.learningScreen.title')}
              </Text>
              <Text tone="muted">{t('profile.learningScreen.body')}</Text>
            </View>
          </Reveal>
          <Reveal delay={staggerDelay(1)}>
            <Goals data={data} />
          </Reveal>
          <Answers data={data} />
        </StepLayout>
      )}
    </OnboardingGate>
  );
}
