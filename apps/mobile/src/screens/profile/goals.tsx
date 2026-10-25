import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChip } from '@/components/choice-chip';
import { DateChoice } from '@/components/date-choice';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { addMonths, calendarDateOf } from '@/lib/dates';
import { commitFeedback, stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { practiceLevel } from '@/onboarding/answers';
import { OnboardingGate } from '@/onboarding/gate';
import { useOnboardingStore } from '@/onboarding/services';
import type { OnboardingData } from '@/onboarding/store';
import { usePracticeServices } from '@/practice/services';
import { goalLevels, HABIT_DAYS, HABIT_MINUTES, habitOf, levelGoalOf } from '@/profile/goals';
import { useAllowance, useProfileServices } from '@/profile/services';
import { wholeMinutes } from '@/lib/format';

// The date wheels open this many months ahead and offer this many years.
const DATE_START_MONTHS_AHEAD = 6;
const DATE_YEARS_AHEAD = 5;

/** One question of the form: its choices, one of which is picked, under a label if it needs one. */
function Choices({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View className="gap-2.5">
      {title ? (
        <Text variant="fieldLabel" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
        {children}
      </View>
    </View>
  );
}

function GoalsForm({
  data,
  header,
  today,
}: {
  data: OnboardingData;
  header: React.ReactNode;
  today: Date;
}) {
  const { t } = useTranslation();
  const store = useOnboardingStore();
  const { home } = usePracticeServices();
  const { allowance } = useProfileServices();
  const voice = useAllowance();
  const habit = habitOf(data.profile);
  const goal = levelGoalOf(data.profile);
  const levels = goalLevels(data.catalog.examLevels, practiceLevel(data));
  const earliest = calendarDateOf(today);

  const [days, setDays] = useState(habit.days);
  const [minutes, setMinutes] = useState(habit.minutes);
  const [level, setLevel] = useState<string | null>(goal?.level ?? null);
  const [by, setBy] = useState<string | null>(goal?.by ?? null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void allowance.load();
  }, [allowance]);

  const pick = <Value,>(set: (value: Value) => void, value: Value) => {
    stepFeedback();
    set(value);
  };

  async function save() {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      await store.save([
        { field: 'weekly_habit', value: { days, minutes } },
        { field: 'level_goal', value: level ? { level, by } : null },
      ]);
      // Today's plan follows the goals: it is worked out again.
      void home.refresh();
      backOr(ROUTES.accountLearning);
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
          <Button label={t('onboarding.save')} loading={saving} onPress={save} />
        </>
      }
    >
      <Reveal>
        <View className="gap-2.5">
          <Text variant="title" accessibilityRole="header">
            {t('profile.goals.title')}
          </Text>
          <Text tone="muted">{t('profile.goals.body')}</Text>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(1)}>
        <Card className="gap-5 bg-surface p-4">
          <Text variant="heading" accessibilityRole="header">
            {t('profile.goals.habit')}
          </Text>
          <Choices title={t('profile.goals.daysTitle')}>
            {HABIT_DAYS.map((count) => (
              <ChoiceChip
                key={count}
                label={t('profile.goals.days', { count })}
                selected={days === count}
                onPress={() => pick(setDays, count)}
              />
            ))}
          </Choices>
          <Choices title={t('profile.goals.minutesTitle')}>
            {HABIT_MINUTES.map((count) => (
              <ChoiceChip
                key={count}
                label={t('time.minutes', { count })}
                selected={minutes === count}
                onPress={() => pick(setMinutes, count)}
              />
            ))}
          </Choices>
          {voice.phase === 'ready' ? (
            <Text variant="small" tone="muted">
              {t('profile.goals.minutesHint', {
                minutes: wholeMinutes(voice.data.weeklySeconds),
              })}
            </Text>
          ) : null}
        </Card>
      </Reveal>

      <Reveal delay={staggerDelay(2)}>
        <Card className="gap-5 bg-surface p-4">
          <Text variant="heading" accessibilityRole="header">
            {t('profile.goals.levelTitle')}
          </Text>
          <Choices>
            <ChoiceChip
              label={t('profile.goals.levelNone')}
              selected={level === null}
              onPress={() => pick(setLevel, null)}
            />
            {levels.map((choice) => (
              <ChoiceChip
                key={choice}
                label={choice}
                selected={level === choice}
                onPress={() => pick(setLevel, choice)}
              />
            ))}
          </Choices>
          {level ? (
            <View className="gap-2.5">
              <Text variant="fieldLabel">{t('profile.goals.byTitle')}</Text>
              <Text variant="small" tone="muted">
                {t('profile.goals.byOptional')}
              </Text>
              <DateChoice
                value={by}
                onChange={setBy}
                opensOn={addMonths(earliest, DATE_START_MONTHS_AHEAD)}
                min={earliest}
                years={{ from: earliest.year, to: earliest.year + DATE_YEARS_AHEAD }}
                labels={{
                  add: t('profile.goals.date.add'),
                  change: t('profile.goals.date.change'),
                  remove: t('profile.goals.date.remove'),
                  title: t('profile.goals.date.title'),
                  confirm: t('profile.goals.date.confirm'),
                }}
              />
            </View>
          ) : null}
        </Card>
      </Reveal>

      <Reveal delay={staggerDelay(3)}>
        <Text variant="small" tone="muted">
          {t('profile.goals.exam')}
        </Text>
      </Reveal>
    </StepLayout>
  );
}

/**
 * 6.3 Your goals (spec §6.12): how much practice a week and a level to reach, which the week's
 * plan on Today follows. The third kind of goal, the exam, is one of the learner's reasons.
 * `today` is injectable for tests; a goal's date is never before it.
 */
export function GoalsScreen({ today: givenToday }: { today?: Date }) {
  const { t } = useTranslation();
  // Read once, so the earliest date cannot move under the user at midnight.
  const [today] = useState(() => givenToday ?? new Date());
  const header = (
    <View className="min-h-tap flex-row items-center">
      <HeaderButton
        icon="chevronLeft"
        label={t('common.back')}
        onPress={() => backOr(ROUTES.accountLearning)}
      />
    </View>
  );
  return (
    <OnboardingGate header={header}>
      {(data) => <GoalsForm data={data} header={header} today={today} />}
    </OnboardingGate>
  );
}
