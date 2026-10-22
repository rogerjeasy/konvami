import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Progress, ProgressWeek } from '@konvami/api-client';
import { BarChart } from '@/components/bar-chart';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { formatDayOfYear, wholeMinutes } from '@/lib/format';

// The least room a number and its label get (pt): the longest label, "conversations", fits on
// one line. On a narrow phone the third number then moves to a second row instead of breaking.
const STAT_MIN_WIDTH = 92;

/** One number with what it counts under it. A screen reader hears the two as one phrase. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={{ minWidth: STAT_MIN_WIDTH }}
      className="flex-1 gap-0.5"
    >
      <Text variant="stat">{value}</Text>
      <Text variant="caption" tone="subtle">
        {label}
      </Text>
    </View>
  );
}

/** The minutes of each week as bars, the oldest week first. */
function WeekBars({ weeks }: { weeks: readonly ProgressWeek[] }) {
  const { t, i18n } = useTranslation();
  return (
    <BarChart
      bars={weeks.map((week) => ({
        key: week.start,
        value: week.seconds,
        label: t('progress.practice.weekLabel', {
          date: formatDayOfYear(i18n.language, week.start),
          minutes: t('time.minutes', { count: wholeMinutes(week.seconds) }),
        }),
      }))}
    />
  );
}

/**
 * How much the learner practised: the minutes, the conversations and the longest streak so
 * far, and the minutes of each of the last weeks as a chart.
 */
export function PracticeCard({ progress }: { progress: Progress }) {
  const { t, i18n } = useTranslation();
  const { activity, weeks, longestStreakDays } = progress;
  const first = weeks[0];
  return (
    <Card className="gap-5 p-4">
      <Text variant="overline" tone="subtle" accessibilityRole="header">
        {t('progress.practice.title')}
      </Text>
      <View className="flex-row flex-wrap gap-x-3 gap-y-4">
        <Stat
          value={t('time.minutes', { count: wholeMinutes(activity.seconds) })}
          label={t('progress.practice.talked')}
        />
        <Stat
          value={String(activity.conversations)}
          label={t('progress.practice.conversations', { count: activity.conversations })}
        />
        <Stat
          value={t('progress.practice.days', { count: longestStreakDays })}
          label={t('progress.practice.streak')}
        />
      </View>
      <View className="gap-2">
        <Text variant="caption" tone="subtle">
          {t('progress.practice.chart')}
        </Text>
        <WeekBars weeks={weeks} />
        <View className="flex-row justify-between gap-3">
          <Text variant="caption" tone="subtle">
            {first
              ? t('progress.since', { date: formatDayOfYear(i18n.language, first.start) })
              : ''}
          </Text>
          <Text variant="caption" tone="subtle">
            {t('progress.thisWeek')}
          </Text>
        </View>
      </View>
    </Card>
  );
}
