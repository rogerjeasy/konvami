import { useMemo } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { motion, size } from '@konvami/design-tokens';
import type { Progress, ProgressWeek } from '@konvami/api-client';
import { Card } from '@/components/card';
import { Animate } from '@/components/motion';
import { Text } from '@/components/text';
import { formatDayOfYear, wholeMinutes } from '@/lib/format';
import { growKeyframes, staggerDelay } from '@/lib/motion';

// A week with practice is never drawn shorter than this (pt): a minute must still be a bar.
const SHORTEST_BAR = 6;
// A week without practice is a line on the baseline, so the chart still shows that week.
const EMPTY_BAR = 2;
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

/** The minutes of each week as bars that grow from the baseline, the oldest week first. */
function WeekBars({ weeks }: { weeks: readonly ProgressWeek[] }) {
  const { t, i18n } = useTranslation();
  const reduced = useReducedMotion();
  const most = Math.max(...weeks.map((week) => week.seconds), 1);
  return (
    <View style={{ height: size.chartHeight }} className="flex-row items-end gap-2">
      {weeks.map((week, i) => {
        const height =
          week.seconds > 0
            ? Math.max(SHORTEST_BAR, Math.round((week.seconds / most) * size.chartHeight))
            : EMPTY_BAR;
        return (
          <View
            key={week.start}
            accessible
            accessibilityLabel={t('progress.practice.weekLabel', {
              date: formatDayOfYear(i18n.language, week.start),
              minutes: t('time.minutes', { count: wholeMinutes(week.seconds) }),
            })}
            style={{ height }}
            // The bar slides up inside its own box, which clips it until it is in place.
            className="flex-1 overflow-hidden rounded-sm"
          >
            <Bar height={height} order={i} filled={week.seconds > 0} reduced={reduced} />
          </View>
        );
      })}
    </View>
  );
}

function Bar({
  height,
  order,
  filled,
  reduced,
}: {
  height: number;
  order: number;
  filled: boolean;
  reduced: boolean;
}) {
  const grow = useMemo(() => growKeyframes(height, reduced), [height, reduced]);
  return (
    <Animate
      keyframes={grow}
      duration={motion.slow}
      delay={motion.enter + staggerDelay(order)}
      style={{ flex: 1 }}
    >
      <View className={`flex-1 rounded-sm ${filled ? 'bg-primary' : 'bg-track'}`} />
    </Animate>
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
