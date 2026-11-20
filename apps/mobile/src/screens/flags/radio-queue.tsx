import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RadioQueueItem } from '@konvami/api-client';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { formatDayOfYear } from '@/lib/format';
import { useRadioApi } from '@/radio/services';

/**
 * 8.8 Radio Konvami on the owner's queue (6.15): calls the check held and segments a listener
 * reported, with their words, the reasons and codenames only. Removing a learner's call takes it
 * off air and is a strike (three close calling in); dismissing closes the item; a whole show can
 * be taken off air. The server refuses everyone but the owners.
 */
export function RadioQueue() {
  const { t, i18n } = useTranslation();
  const api = useRadioApi();
  const [items, setItems] = useState<RadioQueueItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const read = useCallback(() => {
    api.getRadioQueue().then(
      ({ items: found }) => setItems(found),
      () => setItems(null),
    );
  }, [api]);
  useEffect(read, [read]);

  async function decide(item: RadioQueueItem, action: 'remove' | 'dismiss') {
    setBusy(item.id);
    try {
      await api.decideRadioItem(item.kind, item.id, action);
      setItems((shown) => shown?.filter((one) => one.id !== item.id) ?? null);
    } finally {
      setBusy(null);
    }
  }

  async function pull(item: RadioQueueItem) {
    setBusy(item.id);
    try {
      await api.pullRadioEpisode(item.episodeId);
      setItems((shown) => shown?.filter((one) => one.episodeId !== item.episodeId) ?? null);
    } finally {
      setBusy(null);
    }
  }

  if (items === null) return null;
  return (
    <View className="gap-2.5">
      <Text variant="section" accessibilityRole="header">
        {t('radio.queue.title')}
      </Text>
      {items.length === 0 ? (
        <Text tone="muted">{t('radio.queue.empty')}</Text>
      ) : (
        items.map((item) => (
          <Card key={`${item.kind}-${item.id}`} className="gap-2 p-4">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text variant="labelSmall" tone="muted">
                {item.kind === 'held' ? t('radio.queue.held') : t('radio.queue.report')}
              </Text>
              {item.ai ? <Badge label={t('radio.ai')} tone="chip" /> : null}
            </View>
            <Text>{item.transcript}</Text>
            <Text variant="small" tone="muted">
              {item.reasons
                .map((reason) =>
                  item.kind === 'held'
                    ? t(`radio.mine.reasons.${reason}` as 'radio.mine.reasons.unavailable', {
                        defaultValue: reason,
                      })
                    : t(`radio.report.reason.${reason}` as 'radio.report.reason.other', {
                        defaultValue: reason,
                      }),
                )
                .join(' · ')}
              {item.note ? ` · ${item.note}` : ''}
            </Text>
            <Text variant="small" tone="muted">
              {t('radio.queue.speaker', {
                speaker: `${item.speaker} (${item.band})`,
                day: formatDayOfYear(i18n.language, item.day),
              })}
            </Text>
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Button
                  variant="danger"
                  label={t('radio.queue.remove')}
                  loading={busy === item.id}
                  onPress={() => void decide(item, 'remove')}
                />
              </View>
              <View className="flex-1">
                <Button
                  variant="secondary"
                  label={t('radio.queue.dismiss')}
                  disabled={busy === item.id}
                  onPress={() => void decide(item, 'dismiss')}
                />
              </View>
            </View>
            {item.kind === 'report' ? (
              <TextButton
                label={t('radio.queue.pull')}
                disabled={busy === item.id}
                onPress={() => void pull(item)}
              />
            ) : null}
          </Card>
        ))
      )}
    </View>
  );
}
