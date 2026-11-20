import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Activity, WeekPlan } from '@konvami/api-client';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { Tile } from '@/components/tile';
import { useTopicLabels } from '@/hooks/use-labels';
import { WeekStrip, type WeekDay, type WeekDayState } from '@/components/week-strip';
import { formatList, weekdayInitials, weekdayNames } from '@/lib/format';
import { useTheme } from '@/theme';

// Stands between the two numbers of the week ("15 min this week · 10 min today").
const SEPARATOR = ' · ';

// The goal ring (pt): its box, its radius and the width of its stroke, as on the v4 prototype.
const RING = { box: 92, radius: 38, stroke: 11 } as const;
const RING_LENGTH = 2 * Math.PI * RING.radius;

function stateOf(day: Activity['week'][number], today: string): WeekDayState {
  if (day.seconds > 0) return 'done';
  if (day.day === today) return 'today';
  // ISO dates compare like the days they name.
  return day.day < today ? 'open' : 'ahead';
}

/**
 * The streak: the butter block. The number of days in a row, the week as marks, and what to do
 * next. A learner who has not talked yet sees an empty week and what starts a streak, never a
 * number that is not theirs.
 */
export function StreakTile({
  activity,
  restDay = false,
}: {
  activity: Activity;
  /** Today is not a day of the learner's plan: the streak is safe whatever happens. */
  restDay?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const initials = weekdayInitials(i18n.language);
  const names = weekdayNames(i18n.language);

  const days: WeekDay[] = activity.week.map((day, i) => {
    const state = stateOf(day, activity.today);
    return {
      key: day.day,
      initial: initials[i] ?? '',
      state,
      accessibilityLabel: t(`today.week.days.${state}`, { day: names[i] ?? day.day }),
    };
  });

  // What to do next, when there is something to say; a learner who talked today is all set.
  const nudge =
    activity.conversations === 0
      ? t('today.week.empty')
      : activity.practisedToday
        ? null
        : restDay && activity.streakDays > 0
          ? t('motivation.streak.restDay')
          : activity.streakDays > 0
            ? t('today.week.keep')
            : t('today.week.restart');

  return (
    <Tile color="butter" className="flex-1 gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="overline" tone="onButter" accessibilityRole="header">
          {t('today.week.title')}
        </Text>
        <Icon name="flame" color={color.onButter} size={size.iconLg} />
      </View>
      {activity.streakDays > 0 ? (
        <View className="gap-1">
          <Text variant="numeral" tone="onButter" aria-hidden>
            {String(activity.streakDays)}
          </Text>
          <Text variant="labelSmall" tone="onButter">
            {t('today.week.streak', { count: activity.streakDays })}
          </Text>
        </View>
      ) : null}
      {nudge ? (
        <Text variant="labelSmall" tone="onButter">
          {nudge}
        </Text>
      ) : null}
      <View className="mt-auto">
        <WeekStrip days={days} />
      </View>
    </Tile>
  );
}

/**
 * The week's goal: the forest block. A lime ring fills with the minutes against the week's plan,
 * with the minutes and days in words beside it, and the way to change the goal.
 */
export function GoalTile({ plan, onChangeGoal }: { plan: WeekPlan; onChangeGoal: () => void }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const share = plan.minutes > 0 ? Math.min(1, plan.doneMinutes / plan.minutes) : 0;
  // Against the plan: "15 of 40 min this week · 2 of 4 days".
  const numbers = [
    t('today.week.ofPlan', { done: plan.doneMinutes, count: plan.minutes }),
    t('today.week.daysOfPlan', { done: plan.doneDays, count: plan.days }),
  ];
  return (
    <Tile color="forest" className="flex-1 gap-3">
      <View aria-hidden style={{ width: RING.box, height: RING.box }}>
        <Svg width={RING.box} height={RING.box} viewBox={`0 0 ${RING.box} ${RING.box}`}>
          <Circle
            cx={RING.box / 2}
            cy={RING.box / 2}
            r={RING.radius}
            fill="none"
            stroke={color.veilLight}
            strokeWidth={RING.stroke}
          />
          {share > 0 ? (
            <Circle
              cx={RING.box / 2}
              cy={RING.box / 2}
              r={RING.radius}
              fill="none"
              stroke={color.lime}
              strokeWidth={RING.stroke}
              strokeLinecap="round"
              strokeDasharray={`${share * RING_LENGTH} ${RING_LENGTH}`}
              transform={`rotate(-90 ${RING.box / 2} ${RING.box / 2})`}
            />
          ) : null}
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          {share >= 1 ? (
            <Icon name="check" color={color.lime} size={size.iconLg} strokeWidth={3} />
          ) : (
            <Text variant="heading" tone="lime" maxFontSizeMultiplier={1.2}>
              {`${Math.round(share * 100)}%`}
            </Text>
          )}
        </View>
      </View>
      <Text variant="labelSmall" tone="onForest">
        {numbers.join(SEPARATOR)}
      </Text>
      {plan.capped ? (
        <Text variant="small" tone="onForestMuted">
          {t('today.week.capped', { count: plan.minutes })}
        </Text>
      ) : null}
      <View className="mt-auto items-start">
        <TextButton label={t('today.week.changeGoal')} onPress={onChangeGoal} />
      </View>
    </Tile>
  );
}

/** The week's grammar topics: the ink block, the topics in lime (shown only when there are some). */
export function TopicsTile({ plan }: { plan: WeekPlan }) {
  const { t, i18n } = useTranslation();
  const labels = useTopicLabels();
  const topics = plan.topics.map(labels.name);
  if (!topics.length) return null;
  return (
    <Tile color="ink" className="flex-1 gap-2">
      <Text variant="heading" tone="inverseAccent">
        {t('today.week.topics', { topics: formatList(i18n.language, topics) })}
      </Text>
    </Tile>
  );
}
