import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { HomeLevel, LevelPoint } from '@konvami/api-client';
import { Badge } from '@/components/badge';
import { Card } from '@/components/card';
import { LevelBadge } from '@/components/level-badge';
import { SkillLevels } from '@/components/skill-levels';
import { Text } from '@/components/text';
import { formatDate } from '@/lib/format';

// The calendar day of a stored moment ("2026-10-09T12:00:00Z" → "2026-10-09").
const DAY_LENGTH = 'YYYY-MM-DD'.length;

/** Each level the learner practised at, the newest first, from when and set by whom. */
function History({ points }: { points: readonly LevelPoint[] }) {
  const { t, i18n } = useTranslation();
  return (
    <View className="gap-2">
      <View className="h-px bg-border" />
      <Text variant="overline" tone="subtle" accessibilityRole="header">
        {t('progress.levelHistory.title')}
      </Text>
      {[...points].reverse().map((point) => {
        const date = formatDate(i18n.language, point.at.slice(0, DAY_LENGTH));
        const source = t(`onboarding.source.${point.source}`);
        return (
          <View
            key={point.at}
            accessible
            accessibilityLabel={t('progress.levelHistory.row', {
              level: point.level,
              date,
              source,
            })}
            className="flex-row flex-wrap items-baseline gap-x-2"
          >
            <Text variant="label" tone="primary">
              {point.level}
            </Text>
            <Text variant="small" tone="muted" className="shrink">
              {`${date} · ${source}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * The level practice runs at and where it came from (the learner's own estimate, the placement
 * test or the level engine), with the level per skill when the test was taken, and, once the
 * level has moved, how it moved.
 */
export function LevelCard({
  level,
  history = [],
}: {
  level: HomeLevel;
  history?: readonly LevelPoint[];
}) {
  const { t } = useTranslation();
  return (
    <Card className="gap-4 p-4">
      <View className="flex-row items-center gap-3.5">
        <LevelBadge level={level.level} />
        <View className="flex-1 gap-1">
          <Text variant="overline" tone="subtle" accessibilityRole="header">
            {t('today.level.title')}
          </Text>
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <Text variant="label" className="shrink">
              {t(`onboarding.level.levels.${level.level}.label`)}
            </Text>
            <Badge label={t(`onboarding.source.${level.source}`)} tone="surface" />
          </View>
        </View>
      </View>
      {level.skills ? <SkillLevels levels={level.skills} fallback={level.level} /> : null}
      {history.length > 1 ? <History points={history} /> : null}
    </Card>
  );
}
