import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { HomeLevel } from '@konvami/api-client';
import { Badge } from '@/components/badge';
import { Card } from '@/components/card';
import { SkillLevels } from '@/components/skill-levels';
import { Text } from '@/components/text';

/**
 * The level practice starts at and where it came from (the learner's own estimate, or the
 * placement test), with the level per skill when the test was taken.
 */
export function LevelCard({ level }: { level: HomeLevel }) {
  const { t } = useTranslation();
  return (
    <Card className="gap-4 p-4">
      <View className="flex-row items-center gap-3.5">
        <View
          aria-hidden
          style={{ width: size.levelBadgeSm, height: size.levelBadgeSm }}
          className="items-center justify-center rounded-pill border-2 border-primary bg-primary-soft"
        >
          <Text variant="heading" tone="primary">
            {level.level}
          </Text>
        </View>
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
    </Card>
  );
}
