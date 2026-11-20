import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { HomeLevel, LevelOutlook, LevelPoint } from '@konvami/api-client';
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
  outlook = null,
}: {
  level: HomeLevel;
  history?: readonly LevelPoint[];
  /** How close the next level is, once a conversation points to it (motivation). */
  outlook?: LevelOutlook | null;
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
      {outlook ? <OutlookLine outlook={outlook} /> : null}
      {level.skills ? <SkillLevels levels={level.skills} fallback={level.level} /> : null}
      {history.length > 1 ? <History points={history} /> : null}
    </Card>
  );
}

/**
 * The next level coming into view: "3 of 5 conversations point to B1", on the butter "almost
 * there" chip, and what moves the level. Only ever upwards: a level going down is never
 * announced ahead (spec §6.9).
 */
export function OutlookLine({ outlook }: { outlook: LevelOutlook }) {
  const { t } = useTranslation();
  const words = {
    pointing: outlook.pointing,
    needed: outlook.needed,
    agreeing: outlook.agreeing,
    next: outlook.next,
  };
  return (
    <View className="gap-1.5">
      <View className="flex-row flex-wrap items-center gap-2">
        <View className="rounded-pill bg-butter px-2.5 py-0.5">
          <Text variant="captionStrong" tone="onButter">
            {t('motivation.outlook.almost')}
          </Text>
        </View>
        <Text variant="label" className="shrink">
          {t('motivation.outlook.line', words)}
        </Text>
      </View>
      <Text variant="small" tone="muted">
        {t('motivation.outlook.hint', words)}
      </Text>
    </View>
  );
}
