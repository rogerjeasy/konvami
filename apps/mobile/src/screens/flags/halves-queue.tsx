import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { HalvesDecision, HalvesQueueItem, HalvesStats } from '@konvami/api-client';
import { Card } from '@/components/card';
import { ModerationQueue } from '@/components/moderation-queue';
import { Text } from '@/components/text';
import { useHalvesApi } from '@/halves/services';
import { reasonKey } from '@/screens/halves/parts';
import { useOwnerQueue } from './use-owner-queue';

// A nudge's reasons, as the move's reasons name them.
const NUDGE_REASON: Record<string, string> = {
  contact: 'contact_or_meetup',
  off_topic: 'off_task',
  new_detail: 'personal_probe',
  not_rewording: 'off_task',
};

/** 7.16 The owner's numbers for the last 30 days: rates per 1,000 and the time to decide. */
function HalvesStatsCard({ stats }: { stats: HalvesStats }) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const rows: [string, string][] = [
    [t('halves.owner.moves'), number.format(stats.moves)],
    [t('halves.owner.held'), number.format(stats.heldPer1000)],
    [t('halves.owner.reports'), number.format(stats.reportsPer1000)],
    [t('halves.owner.blocks'), number.format(stats.blocksPer1000Cases)],
    [
      t('halves.owner.decision'),
      stats.medianDecisionHours === null
        ? t('halves.owner.none')
        : t('halves.owner.hours', { hours: number.format(stats.medianDecisionHours) }),
    ],
    [t('halves.owner.open'), number.format(stats.openItems)],
  ];
  return (
    <Card className="gap-2 p-4">
      <Text variant="labelSmall" tone="muted">
        {t('halves.owner.stats')}
      </Text>
      {rows.map(([label, value]) => (
        <View key={label} className="flex-row flex-wrap items-baseline justify-between gap-2">
          <Text className="flex-1">{label}</Text>
          <Text variant="labelMedium">{value}</Text>
        </View>
      ))}
      <Text variant="small" tone="muted">
        {t('halves.owner.nudges', { dropped: stats.nudgesDropped, count: stats.nudges })}
      </Text>
    </Card>
  );
}

/**
 * 6.15 Two Halves on the owner's queue: moves the check held, moves a learner reported and nudges
 * the verifier dropped, with their words, the reasons and the codenames only. Removing one is a
 * strike for its sender (three suspend Two Halves for them); a warning or a suspension can be
 * given at once; dismissing closes it. The server refuses everyone but the owners.
 */
export function HalvesQueue() {
  const { t } = useTranslation();
  const api = useHalvesApi();
  const { items, busy, decide } = useOwnerQueue<HalvesQueueItem>(api.getHalvesQueue);
  const [stats, setStats] = useState<HalvesStats | null>(null);
  useEffect(() => {
    api.getHalvesStats().then(setStats, () => setStats(null));
  }, [api]);

  if (items === null) return null;
  const act = (item: HalvesQueueItem, action: HalvesDecision) => () =>
    void decide(item, () => api.decideHalvesItem(item.kind, item.id, action));
  return (
    <ModerationQueue
      title={t('halves.queue.title')}
      empty={t('halves.queue.empty')}
      header={stats ? <HalvesStatsCard stats={stats} /> : null}
      entries={items.map((item) => ({
        key: `${item.kind}-${item.id}`,
        label:
          item.kind === 'held'
            ? t('halves.queue.held')
            : item.kind === 'nudge'
              ? t('halves.owner.nudge')
              : t('halves.queue.report', { reporter: item.reporter ?? '' }),
        transcript: item.transcript,
        details: [
          item.reasons
            .map((reason) =>
              item.kind === 'nudge'
                ? t(reasonKey(NUDGE_REASON[reason] ?? reason))
                : item.kind === 'held'
                  ? t(reasonKey(reason))
                  : t(`halves.report.reason.${reason}`, { defaultValue: reason }),
            )
            .join(' · ') + (item.note ? ` · ${item.note}` : ''),
          `${t('halves.queue.sender', { sender: item.sender, band: item.band })} · ${
            item.suspended
              ? t('halves.owner.suspended')
              : t('halves.owner.strikes', { count: item.strikes })
          }`,
        ],
        actions: [
          {
            label: t('halves.queue.remove'),
            variant: 'danger',
            loading: busy === item.id,
            onPress: act(item, 'remove'),
          },
          {
            label: t('halves.queue.dismiss'),
            variant: 'secondary',
            disabled: busy === item.id,
            onPress: act(item, 'dismiss'),
          },
          {
            label: t('halves.owner.warn'),
            variant: 'secondary',
            disabled: busy === item.id,
            onPress: act(item, 'warn'),
          },
          {
            label: t('halves.owner.suspend'),
            variant: 'danger',
            disabled: busy === item.id || item.suspended,
            onPress: act(item, 'suspend'),
          },
        ],
      }))}
    />
  );
}
