import { useTranslation } from 'react-i18next';
import type { RadioQueueItem } from '@konvami/api-client';
import { ModerationQueue } from '@/components/moderation-queue';
import { formatDayOfYear } from '@/lib/format';
import { useRadioApi } from '@/radio/services';
import { useOwnerQueue } from './use-owner-queue';

/**
 * 8.8 Radio Konvami on the owner's queue (6.15): calls the check held and segments a listener
 * reported, with their words, the reasons and codenames only. Removing a learner's call takes it
 * off air and is a strike (three close calling in); dismissing closes the item; a whole show can
 * be taken off air. The server refuses everyone but the owners.
 */
export function RadioQueue() {
  const { t, i18n } = useTranslation();
  const api = useRadioApi();
  const { items, busy, decide } = useOwnerQueue<RadioQueueItem>(api.getRadioQueue);

  if (items === null) return null;
  return (
    <ModerationQueue
      title={t('radio.queue.title')}
      empty={t('radio.queue.empty')}
      entries={items.map((item) => ({
        key: `${item.kind}-${item.id}`,
        label: item.kind === 'held' ? t('radio.queue.held') : t('radio.queue.report'),
        badge: item.ai ? t('radio.ai') : undefined,
        transcript: item.transcript,
        details: [
          item.reasons
            .map((reason) =>
              item.kind === 'held'
                ? t(`radio.mine.reasons.${reason}` as 'radio.mine.reasons.unavailable', {
                    defaultValue: reason,
                  })
                : t(`radio.report.reason.${reason}` as 'radio.report.reason.other', {
                    defaultValue: reason,
                  }),
            )
            .join(' · ') + (item.note ? ` · ${item.note}` : ''),
          t('radio.queue.speaker', {
            speaker: `${item.speaker} (${item.band})`,
            day: formatDayOfYear(i18n.language, item.day),
          }),
        ],
        actions: [
          {
            label: t('radio.queue.remove'),
            variant: 'danger',
            loading: busy === item.id,
            onPress: () =>
              void decide(item, () => api.decideRadioItem(item.kind, item.id, 'remove')),
          },
          {
            label: t('radio.queue.dismiss'),
            variant: 'secondary',
            disabled: busy === item.id,
            onPress: () =>
              void decide(item, () => api.decideRadioItem(item.kind, item.id, 'dismiss')),
          },
        ],
        extra:
          item.kind === 'report'
            ? {
                label: t('radio.queue.pull'),
                variant: 'secondary',
                disabled: busy === item.id,
                // Taking the show off air closes every item of that show.
                onPress: () =>
                  void decide(
                    item,
                    () => api.pullRadioEpisode(item.episodeId),
                    (one) => one.episodeId === item.episodeId,
                  ),
              }
            : undefined,
      }))}
    />
  );
}
