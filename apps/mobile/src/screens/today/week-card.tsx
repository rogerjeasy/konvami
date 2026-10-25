import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Activity, WeekPlan } from '@konvami/api-client';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useTopicLabels } from '@/hooks/use-labels';
import { WeekStrip, type WeekDay, type WeekDayState } from '@/components/week-strip';
import { formatList, weekdayInitials, weekdayNames } from '@/lib/format';
import { useTheme } from '@/theme';

// Stands between the two numbers of the week ("15 min this week · 10 min today").
const SEPARATOR = ' · ';

function stateOf(day: Activity['week'][number], today: string): WeekDayState {
  if (day.seconds > 0) return 'done';
  if (day.day === today) return 'today';
  // ISO dates compare like the days they name.
  return day.day < today ? 'open' : 'ahead';
}

/**
 * This week at a glance: the days practised, the streak, the minutes and days against the
 * week's plan, and the grammar topics the week works on. A learner who has not talked yet sees
 * an empty week and what starts a streak, never a number that is not theirs.
 */
export function WeekCard({
  activity,
  plan,
  onChangeGoal,
}: {
  activity: Activity;
  plan: WeekPlan;
  onChangeGoal: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const initials = weekdayInitials(i18n.language);
  const names = weekdayNames(i18n.language);
  const labels = useTopicLabels();

  const days: WeekDay[] = activity.week.map((day, i) => {
    const state = stateOf(day, activity.today);
    return {
      key: day.day,
      initial: initials[i] ?? '',
      state,
      accessibilityLabel: t(`today.week.days.${state}`, { day: names[i] ?? day.day }),
    };
  });

  // Against the plan: "15 of 40 min this week · 2 of 4 days".
  const numbers = [
    t('today.week.ofPlan', { done: plan.doneMinutes, count: plan.minutes }),
    t('today.week.daysOfPlan', { done: plan.doneDays, count: plan.days }),
  ];
  const topics = plan.topics.map(labels.name);

  // What to do next, when there is something to say; a learner who talked today is all set.
  const nudge =
    activity.conversations === 0
      ? t('today.week.empty')
      : activity.practisedToday
        ? null
        : activity.streakDays > 0
          ? t('today.week.keep')
          : t('today.week.restart');

  return (
    <Card className="gap-4 p-4">
      <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Text variant="overline" tone="subtle" accessibilityRole="header">
          {t('today.week.title')}
        </Text>
        {activity.streakDays > 0 ? (
          <Pill
            tone="primary"
            label={t('today.week.streak', { count: activity.streakDays })}
            leading={<Icon name="flame" color={color.primaryText} size={size.iconSm} />}
          />
        ) : null}
      </View>
      <WeekStrip days={days} />
      <View className="gap-1">
        <Text variant="label">{numbers.join(SEPARATOR)}</Text>
        {nudge ? (
          <Text variant="callout" tone="muted">
            {nudge}
          </Text>
        ) : null}
      </View>
      {topics.length || plan.capped ? (
        <View className="gap-1">
          {topics.length ? (
            <Text variant="small" tone="muted">
              {t('today.week.topics', { topics: formatList(i18n.language, topics) })}
            </Text>
          ) : null}
          {plan.capped ? (
            <Text variant="small" tone="muted">
              {t('today.week.capped', { count: plan.minutes })}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View className="items-start">
        <TextButton tone="primary" label={t('today.week.changeGoal')} onPress={onChangeGoal} />
      </View>
    </Card>
  );
}
