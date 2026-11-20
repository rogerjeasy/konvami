import { useTranslation } from 'react-i18next';
import type { HalvesQueueItem } from '@konvami/api-client';
import { ModerationQueue } from '@/components/moderation-queue';
import { useChainApi } from '@/chain/services';
import { reasonKey } from '@/screens/halves/parts';
import { useOwnerQueue } from './use-owner-queue';

/**
 * 9.11 The story chain on the owner's queue (6.15): lines the check held and lines a player
 * reported, with their words, the reasons and codenames only. Removing one is a strike for its
 * speaker (three close the story chain for them); dismissing closes it. The reasons are Two
 * Halves', as the check is. The server refuses everyone but the owners.
 */
export function ChainQueue() {
  const { t } = useTranslation();
  const api = useChainApi();
  const { items, busy, decide } = useOwnerQueue<HalvesQueueItem>(api.getChainQueue);

  if (items === null) return null;
  const act = (item: HalvesQueueItem, action: 'remove' | 'dismiss') => () => {
    if (item.kind === 'nudge') return;
    void decide(item, () => api.decideChainItem(item.kind as 'held' | 'report', item.id, action));
  };
  return (
    <ModerationQueue
      title={t('chain.queue.title')}
      empty={t('halves.queue.empty')}
      entries={items.map((item) => ({
        key: `${item.kind}-${item.id}`,
        label:
          item.kind === 'held'
            ? t('halves.queue.held')
            : t('halves.queue.report', { reporter: item.reporter ?? '' }),
        transcript: item.transcript,
        details: [
          item.reasons
            .map((reason) =>
              item.kind === 'held'
                ? t(reasonKey(reason))
                : t(`halves.report.reason.${reason}`, { defaultValue: reason }),
            )
            .join(' · ') + (item.note ? ` · ${item.note}` : ''),
          t('halves.queue.sender', { sender: item.sender, band: item.band }),
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
        ],
      }))}
    />
  );
}
