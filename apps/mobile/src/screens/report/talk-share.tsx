import { useMemo } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { motion, size } from '@konvami/design-tokens';
import type { SessionReport } from '@konvami/api-client';
import { Animate } from '@/components/motion';
import { Text } from '@/components/text';
import { formatPercent } from '@/lib/format';
import { fillKeyframes } from '@/lib/motion';

/**
 * How much of the talking was the learner's, counted in words: a bar that fills to their share,
 * and the numbers behind it. A conversation is practice when the learner does most of it.
 */
export function TalkShare({ stats, partner }: { stats: SessionReport['stats']; partner: string }) {
  const { t, i18n } = useTranslation();
  const reduced = useReducedMotion();
  const fill = useMemo(() => fillKeyframes(reduced), [reduced]);
  const words = stats.learnerWords + stats.partnerWords;
  const share = words > 0 ? stats.learnerWords / words : 0;
  const percent = formatPercent(i18n.language, share);
  return (
    <View className="gap-2.5">
      <Text variant="overline" tone="subtle">
        {t('report.share.title')}
      </Text>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('report.share.label', { percent })}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
        className="flex-row items-center gap-3"
      >
        <Text variant="stat">{percent}</Text>
        <View
          style={{ height: size.meterHeight }}
          className="flex-1 overflow-hidden rounded-pill bg-track"
        >
          <Animate
            keyframes={fill}
            duration={motion.slow}
            delay={motion.enter}
            style={{ width: `${share * 100}%`, height: '100%', transformOrigin: 'left' }}
          >
            <View className="flex-1 rounded-pill bg-primary" />
          </Animate>
        </View>
      </View>
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
