import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Activity } from '@konvami/api-client';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { WeekStrip, type WeekDay, type WeekDayState } from '@/components/week-strip';
import { weekdayInitials, weekdayNames, wholeMinutes } from '@/lib/format';
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
 * This week at a glance: the days practised, the streak and the minutes. A learner who has not
 * talked yet sees an empty week and what starts a streak, never a number that is not theirs.
 */
export function WeekCard({ activity }: { activity: Activity }) {
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

  const numbers = [
    activity.weekSeconds > 0
      ? t('today.week.minutes', { count: wholeMinutes(activity.weekSeconds) })
      : null,
    activity.todaySeconds > 0
      ? t('today.week.today', { count: wholeMinutes(activity.todaySeconds) })
      : null,
  ].filter((text) => text !== null);

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
      {numbers.length || nudge ? (
        <View className="gap-1">
          {numbers.length ? <Text variant="label">{numbers.join(SEPARATOR)}</Text> : null}
          {nudge ? (
            <Text variant="callout" tone="muted">
              {nudge}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
