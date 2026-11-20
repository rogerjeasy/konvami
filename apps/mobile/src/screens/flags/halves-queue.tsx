import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { HalvesQueueItem } from '@konvami/api-client';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { useChainApi } from '@/chain/services';
import { useHalvesApi } from '@/halves/services';
import { reasonKey } from '@/screens/halves/parts';

type Decide = (kind: 'held' | 'report', id: string, action: 'remove' | 'dismiss') => Promise<void>;

/**
 * 6.15 Two Halves on the owner's queue: moves the check held and moves a learner reported, with
 * their words, the reasons and the codenames only. Removing one is a strike for its sender
 * (three suspend Two Halves for them); dismissing closes it. Nothing is shown to other owners'
 * accounts or learners: the server refuses them.
 */
export function HalvesQueue() {
  const api = useHalvesApi();
  return (
    <SocialQueue
      titleKey="halves.queue.title"
      load={api.getHalvesQueue}
      decide={api.decideHalvesItem}
    />
  );
}

/** 9.11 The story chain on the owner's queue: held and reported lines, the same way. */
export function ChainQueue() {
  const api = useChainApi();
  return (
    <SocialQueue
      titleKey="chain.queue.title"
      load={api.getChainQueue}
      decide={api.decideChainItem}
    />
  );
}

/** A game's held and reported voice messages, for the owner to remove (a strike) or dismiss. */
function SocialQueue({
  titleKey,
  load,
  decide: send,
}: {
  titleKey: 'halves.queue.title' | 'chain.queue.title';
  load: () => Promise<{ items: HalvesQueueItem[] }>;
  decide: Decide;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<HalvesQueueItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const read = useCallback(() => {
    load().then(
      ({ items: found }) => setItems(found),
      () => setItems(null),
    );
  }, [load]);
  useEffect(read, [read]);

  async function decide(item: HalvesQueueItem, action: 'remove' | 'dismiss') {
    setBusy(item.id);
    try {
      await send(item.kind, item.id, action);
      setItems((shown) => shown?.filter((one) => one.id !== item.id) ?? null);
    } finally {
      setBusy(null);
    }
  }

  if (items === null) return null;
  return (
    <View className="gap-2.5">
      <Text variant="section" accessibilityRole="header">
        {t(titleKey)}
      </Text>
      {items.length === 0 ? (
        <Text tone="muted">{t('halves.queue.empty')}</Text>
      ) : (
        items.map((item) => (
          <Card key={`${item.kind}-${item.id}`} className="gap-2 p-4">
            <Text variant="labelSmall" tone="muted">
              {item.kind === 'held'
                ? t('halves.queue.held')
                : t('halves.queue.report', { reporter: item.reporter ?? '' })}
            </Text>
            <Text>{item.transcript}</Text>
            <Text variant="small" tone="muted">
              {item.reasons
                .map((reason) =>
                  item.kind === 'held'
                    ? t(reasonKey(reason))
                    : t(`halves.report.reason.${reason}`, { defaultValue: reason }),
                )
                .join(' · ')}
              {item.note ? ` · ${item.note}` : ''}
            </Text>
            <Text variant="small" tone="muted">
              {t('halves.queue.sender', { sender: item.sender, band: item.band })}
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
          </Card>
        ))
      )}
    </View>
  );
}
