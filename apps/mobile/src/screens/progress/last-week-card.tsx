import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { WeekReview } from '@konvami/api-client';
import { Card } from '@/components/card';
import { PlayButton } from '@/components/play-button';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useTopicLabels } from '@/hooks/use-labels';
import { useSound } from '@/hooks/use-sound';
import { usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { Stat } from './practice-card';

/** The partner's few sentences, the moment they are being written, or why they are missing. */
function Words({ review }: { review: WeekReview }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { followWeekReview, weekSound } = usePracticeServices();
  const week = review.numbers.week;
  const follower = useMemo(() => followWeekReview(week), [followWeekReview, week]);
  const view = useSyncExternalStore(follower.subscribe, follower.getState, follower.getState);
  const sound = useSound(week, weekSound);

  // Opening Progress in a new week is what has the check-in written: no nightly job.
  useEffect(() => {
    follower.start(review);
    return () => follower.stop();
    // The review read when the screen opened decides; later reads go through the follower.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follower]);

  if (view.phase === 'ready') {
    return (
      <View className="flex-row items-start gap-3">
        <Text variant="callout" className="flex-1">
          {view.text}
        </Text>
        <PlayButton
          label={
            sound.state === 'playing'
              ? t('progress.lastWeek.stop')
              : t('progress.lastWeek.listenLabel')
          }
          state={sound.state}
          onPress={sound.toggle}
        />
      </View>
    );
  }
  if (view.phase === 'writing') {
    return (
      <View className="flex-row items-center gap-2.5">
        <ActivityIndicator color={color.primary} />
        <Text variant="small" tone="muted" className="flex-1">
          {t('progress.lastWeek.writing')}
        </Text>
      </View>
    );
  }
  if (view.phase === 'failed') {
    return (
      <View className="items-start gap-1">
        <Text variant="small" tone="muted">
          {t('progress.lastWeek.failed')}
        </Text>
        <TextButton
          tone="primary"
          label={t('progress.lastWeek.retry')}
          onPress={() => void follower.request()}
        />
      </View>
    );
  }
  return null;
}

/**
 * Last week's check-in (spec §6.12, §6.15 "weekly report"): a few sentences from the partner,
 * which they can listen to, and the week's numbers against its plan: minutes, days,
 * conversations, cards, how the week's topics moved, confirmed mistakes and the level.
 */
export function LastWeekCard({ review }: { review: WeekReview }) {
  const { t } = useTranslation();
  const labels = useTopicLabels();
  const { numbers } = review;
  const { levelBefore, levelAfter } = numbers;
  return (
    <Card className="gap-4 p-4">
      <Text variant="overline" tone="subtle" accessibilityRole="header">
        {t('progress.lastWeek.title')}
      </Text>
      <Words review={review} />
      <View className="flex-row flex-wrap gap-x-3 gap-y-4">
        <Stat
          value={t('time.minutes', { count: numbers.minutes })}
          label={t('progress.lastWeek.talked', { count: numbers.plannedMinutes })}
        />
        <Stat
          value={String(numbers.days)}
          label={t('progress.lastWeek.days', { count: numbers.plannedDays })}
        />
        <Stat
          value={String(numbers.conversations)}
          label={t('progress.lastWeek.conversations', { count: numbers.conversations })}
        />
        <Stat
          value={String(numbers.cardsReviewed)}
          label={t('progress.lastWeek.cards', { count: numbers.cardsReviewed })}
        />
      </View>
      <View className="gap-1.5">
        <Text variant="small" tone="muted">
          {t('progress.lastWeek.before', { count: numbers.previousMinutes })}
        </Text>
        <Text variant="small" tone="muted">
          {t('progress.lastWeek.mistakes', {
            count: numbers.mistakes,
            previous: numbers.previousMistakes,
          })}
        </Text>
        {levelBefore && levelAfter && levelAfter !== levelBefore ? (
          <Text variant="small" tone="muted">
            {t('progress.lastWeek.level', { before: levelBefore, after: levelAfter })}
          </Text>
        ) : null}
      </View>
      {numbers.topics.length ? (
        <View className="gap-1.5">
          <Text variant="caption" tone="subtle">
            {t('progress.lastWeek.topics')}
          </Text>
          {numbers.topics.map((move) => (
            <Text key={move.topic} variant="label" tone={move.moved ? 'primary' : 'fg'}>
              {move.moved
                ? t('progress.lastWeek.topic', {
                    topic: labels.name(move.topic),
                    before: labels.mastery(move.before),
                    after: labels.mastery(move.after),
                  })
                : t('progress.lastWeek.steady', {
                    topic: labels.name(move.topic),
                    state: labels.mastery(move.after),
                  })}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
