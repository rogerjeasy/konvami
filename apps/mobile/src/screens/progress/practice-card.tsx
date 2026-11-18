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
// A stat on its own card: the longest label (about 80 pt) and the card's padding. Three fit side
// by side on a 390 pt phone; on a narrow one the third moves to a second row.
const STAT_CARD_MIN_WIDTH = 100;

/** One number with what it counts under it. A screen reader hears the two as one phrase. */
export function Stat({
  value,
  label,
  boxed = false,
}: {
  value: string;
  label: string;
  /** Inside a card that keeps the width itself (`StatCard`). */
  boxed?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={boxed ? undefined : { minWidth: STAT_MIN_WIDTH }}
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

/** A number on its own white card, as the three counts of v4 stand side by side. */
function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <View
      style={{ minWidth: STAT_CARD_MIN_WIDTH }}
      className="flex-1 rounded-card border border-border bg-chip px-3 py-3"
    >
      <Stat value={value} label={label} boxed />
    </View>
  );
}

/**
 * How much the learner practised: the minutes, the conversations and the longest streak so
 * far as three stat cards, and the minutes of each of the last weeks as a chart on its own card.
 */
export function PracticeCard({ progress }: { progress: Progress }) {
  const { t, i18n } = useTranslation();
  const { activity, weeks, longestStreakDays } = progress;
  const first = weeks[0];
  return (
    <View className="gap-3">
      <Text variant="section" accessibilityRole="header">
        {t('progress.practice.title')}
      </Text>
      <View className="flex-row flex-wrap gap-2.5">
        <StatCard
          value={t('time.minutes', { count: wholeMinutes(activity.seconds) })}
          label={t('progress.practice.talked')}
        />
        <StatCard
          value={String(activity.conversations)}
          label={t('progress.practice.conversations', { count: activity.conversations })}
        />
        <StatCard
          value={t('progress.practice.days', { count: longestStreakDays })}
          label={t('progress.practice.streak')}
        />
      </View>
      <Card className="gap-3 p-4">
        <Text variant="heading">{t('progress.practice.chart')}</Text>
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
      </Card>
    </View>
  );
}
