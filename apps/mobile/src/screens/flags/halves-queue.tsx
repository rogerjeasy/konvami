import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { HalvesDecision, HalvesQueueItem, HalvesStats } from '@konvami/api-client';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { useHalvesApi } from '@/halves/services';
import { reasonKey } from '@/screens/halves/parts';

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
 * 6.15 Two Halves on the owner's queue: moves the check held and moves a learner reported, with
 * their words, the reasons and the codenames only. Removing one is a strike for its sender
 * (three suspend Two Halves for them); dismissing closes it. Nothing is shown to other owners'
 * accounts or learners: the server refuses them.
 */
export function HalvesQueue() {
  const { t } = useTranslation();
  const api = useHalvesApi();
  const [items, setItems] = useState<HalvesQueueItem[] | null>(null);
  const [stats, setStats] = useState<HalvesStats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const read = useCallback(() => {
    api.getHalvesQueue().then(
      ({ items: found }) => setItems(found),
      () => setItems(null),
    );
    api.getHalvesStats().then(setStats, () => setStats(null));
  }, [api]);
  useEffect(read, [read]);

  async function decide(item: HalvesQueueItem, action: HalvesDecision) {
    setBusy(item.id);
    try {
      await api.decideHalvesItem(item.kind, item.id, action);
      setItems((shown) => shown?.filter((one) => one.id !== item.id) ?? null);
    } finally {
      setBusy(null);
    }
  }

  if (items === null) return null;
  return (
    <View className="gap-2.5">
      <Text variant="section" accessibilityRole="header">
        {t('halves.queue.title')}
      </Text>
      {stats ? <HalvesStatsCard stats={stats} /> : null}
      {items.length === 0 ? (
        <Text tone="muted">{t('halves.queue.empty')}</Text>
      ) : (
        items.map((item) => (
          <Card key={`${item.kind}-${item.id}`} className="gap-2 p-4">
            <Text variant="labelSmall" tone="muted">
              {item.kind === 'held'
                ? t('halves.queue.held')
                : item.kind === 'nudge'
                  ? t('halves.owner.nudge')
                  : t('halves.queue.report', { reporter: item.reporter ?? '' })}
            </Text>
            <Text>{item.transcript}</Text>
            <Text variant="small" tone="muted">
              {item.reasons
                .map((reason) =>
                  item.kind === 'nudge'
                    ? t(reasonKey(NUDGE_REASON[reason] ?? reason))
                    : item.kind === 'held'
                      ? t(reasonKey(reason))
                      : t(`halves.report.reason.${reason}`, { defaultValue: reason }),
                )
                .join(' · ')}
              {item.note ? ` · ${item.note}` : ''}
            </Text>
            <Text variant="small" tone="muted">
              {t('halves.queue.sender', { sender: item.sender, band: item.band })}
              {' · '}
              {item.suspended
                ? t('halves.owner.suspended')
                : t('halves.owner.strikes', { count: item.strikes })}
            </Text>
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Button
                  variant="danger"
                  label={t('halves.queue.remove')}
                  loading={busy === item.id}
                  onPress={() => void decide(item, 'remove')}
                />
              </View>
              <View className="flex-1">
                <Button
                  variant="secondary"
                  label={t('halves.queue.dismiss')}
                  disabled={busy === item.id}
                  onPress={() => void decide(item, 'dismiss')}
                />
              </View>
            </View>
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Button
                  variant="secondary"
                  label={t('halves.owner.warn')}
                  disabled={busy === item.id}
                  onPress={() => void decide(item, 'warn')}
                />
              </View>
              <View className="flex-1">
                <Button
                  variant="danger"
                  label={t('halves.owner.suspend')}
                  disabled={busy === item.id || item.suspended}
                  onPress={() => void decide(item, 'suspend')}
                />
              </View>
            </View>
          </Card>
        ))
      )}
    </View>
  );
}
