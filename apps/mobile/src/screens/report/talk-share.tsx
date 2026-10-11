import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SessionReport } from '@konvami/api-client';
import { Meter } from '@/components/meter';
import { Text } from '@/components/text';
import { formatPercent } from '@/lib/format';

/**
 * How much of the talking was the learner's, counted in words: a bar that fills to their share,
 * and the numbers behind it. A conversation is practice when the learner does most of it.
 */
export function TalkShare({ stats, partner }: { stats: SessionReport['stats']; partner: string }) {
  const { t, i18n } = useTranslation();
  const words = stats.learnerWords + stats.partnerWords;
  const share = words > 0 ? stats.learnerWords / words : 0;
  const percent = formatPercent(i18n.language, share);
  return (
    <View className="gap-2.5">
      <Text variant="overline" tone="subtle">
        {t('report.share.title')}
      </Text>
      <Meter share={share} value={percent} label={t('report.share.label', { percent })} />
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {[
          t('report.share.you', { count: stats.learnerWords }),
          t('report.share.partner', { name: partner, count: stats.partnerWords }),
          t('report.share.longest', { count: stats.longestTurnWords }),
        ].map((line) => (
          <Text key={line} variant="small" tone="muted">
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}
