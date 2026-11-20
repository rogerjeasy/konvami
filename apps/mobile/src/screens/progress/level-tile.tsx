import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { HomeLevel, LevelOutlook, LevelPoint } from '@konvami/api-client';
import { Card } from '@/components/card';
import { OutlookLine } from '@/components/level-card';
import { SkillLevels } from '@/components/skill-levels';
import { Text } from '@/components/text';
import { Tile, TileChip } from '@/components/tile';
import { formatDate } from '@/lib/format';
import { ILLUSTRATION_MAX_FONT_SCALE } from '@/lib/layout';

/** The CEFR steps drawn as the path under the level; A0 ("no usable language yet") fills none. */
const PATH = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

// The calendar day of a stored moment ("2026-10-09T12:00:00Z" → "2026-10-09").
const DAY_LENGTH = 'YYYY-MM-DD'.length;

/**
 * Each level the learner practised at, the newest first, from when and set by whom.
 * The same rows as the history of `components/level-card.tsx`, which this screen no longer shows.
 */
function LevelHistory({ points }: { points: readonly LevelPoint[] }) {
  const { t, i18n } = useTranslation();
  return (
    <View className="gap-2">
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
 * The level as the forest block of v4: the level itself in big lime letters, its name and where
 * it came from, and the CEFR path with every step up to it filled. The level per skill and how
 * the level moved follow on a plain card, when there is something to show.
 */
export function LevelTile({
  level,
  history = [],
  outlook = null,
}: {
  level: HomeLevel;
  history?: readonly LevelPoint[];
  /** How close the next level is: its step on the path turns butter, "almost there". */
  outlook?: LevelOutlook | null;
}) {
  const { t } = useTranslation();
  const reached = PATH.indexOf(level.level as (typeof PATH)[number]);
  const almost = outlook ? PATH.indexOf(outlook.next as (typeof PATH)[number]) : -1;
  const moved = history.length > 1;
  return (
    <View className="gap-3">
      <Tile color="forest" className="gap-3">
        <Text variant="overline" tone="onForest" accessibilityRole="header">
          {t('today.level.title')}
        </Text>
        <View className="flex-row flex-wrap items-end gap-x-3.5 gap-y-2">
          {/* The name beside it says the level, so the big letters are decoration. */}
          <Text
            variant="jumbo"
            tone="lime"
            aria-hidden
            maxFontSizeMultiplier={ILLUSTRATION_MAX_FONT_SCALE}
          >
            {level.level}
          </Text>
          <View className="shrink gap-1.5 pb-3">
            <Text variant="label" tone="onForest">
              {t(`onboarding.level.levels.${level.level}.label`)}
            </Text>
            <TileChip>
              <Text variant="captionStrong" tone="onForest">
                {t(`onboarding.source.${level.source}`)}
              </Text>
            </TileChip>
          </View>
        </View>
        <View aria-hidden className="gap-1.5">
          <View className="flex-row gap-1.5">
            {PATH.map((step, i) => (
              <View
                key={step}
                style={{ height: size.meterHeight }}
                className={`flex-1 rounded-pill ${
                  i <= reached ? 'bg-lime' : i === almost ? 'bg-butter' : 'bg-veil-light'
                }`}
              />
            ))}
          </View>
          <View className="flex-row gap-1.5">
            {PATH.map((step, i) => (
              <Text
                key={step}
                variant="captionStrong"
                tone={i === reached ? 'lime' : 'onForestMuted'}
                className="flex-1"
              >
                {step}
              </Text>
            ))}
          </View>
        </View>
      </Tile>
      {outlook || level.skills || moved ? (
        <Card className="gap-4 p-4">
          {outlook ? <OutlookLine outlook={outlook} /> : null}
          {level.skills ? <SkillLevels levels={level.skills} fallback={level.level} /> : null}
          {moved ? <LevelHistory points={history} /> : null}
        </Card>
      ) : null}
    </View>
  );
}
