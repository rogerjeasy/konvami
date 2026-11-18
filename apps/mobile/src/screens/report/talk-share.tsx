import { useMemo } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { motion } from '@konvami/design-tokens';
import type { SessionReport } from '@konvami/api-client';
import { Animate } from '@/components/motion';
import { Text } from '@/components/text';
import { Tile } from '@/components/tile';
import { formatPercent } from '@/lib/format';
import { fillKeyframes } from '@/lib/motion';

// The share bar on the forest tile (pt): thicker than a plain meter, as on the v4 prototype.
const BAR_HEIGHT = 16;

/**
 * How much of the talking was the learner's, counted in words, on the report's forest tile: the
 * share large in lime, a lime bar that fills to it, and the numbers behind it. A conversation is
 * practice when the learner does most of it.
 */
export function TalkShare({ stats, partner }: { stats: SessionReport['stats']; partner: string }) {
  const { t, i18n } = useTranslation();
  const reduced = useReducedMotion();
  const fill = useMemo(() => fillKeyframes(reduced), [reduced]);
  const words = stats.learnerWords + stats.partnerWords;
  const share = words > 0 ? stats.learnerWords / words : 0;
  const percent = formatPercent(i18n.language, share);
  return (
    <Tile color="forest" className="gap-3">
      <View className="flex-row flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <Text variant="label" tone="onForest" className="shrink">
          {t('report.share.title')}
        </Text>
        <Text variant="numeral" tone="lime">
          {percent}
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('report.share.label', { percent })}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
        style={{ height: BAR_HEIGHT }}
        className="overflow-hidden rounded-pill bg-veil-light"
      >
        <Animate
          keyframes={fill}
          duration={motion.slow}
          delay={motion.enter}
          style={{ width: `${share * 100}%`, height: '100%', transformOrigin: 'left' }}
        >
          <View className="flex-1 rounded-pill bg-lime" />
        </Animate>
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {[
          t('report.share.you', { count: stats.learnerWords }),
          t('report.share.partner', { name: partner, count: stats.partnerWords }),
          t('report.share.longest', { count: stats.longestTurnWords }),
        ].map((line) => (
          <Text key={line} variant="small" tone="onForestMuted">
            {line}
          </Text>
        ))}
      </View>
    </Tile>
  );
}
