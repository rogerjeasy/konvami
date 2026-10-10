import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Text } from '@/components/text';
import type { StartingLevel } from '@/onboarding/essentials';

/** The skills of a placement result, in the order they are shown. */
const SKILLS = ['speaking', 'listening', 'grammar', 'vocabulary', 'pronunciation'] as const;

/** Every level, lowest first. The first one ("no usable language yet") fills nothing. */
const SCALE: readonly StartingLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** One skill: its name, its level, and how far up the scale that is. */
function SkillRow({ name, level }: { name: string; level: StartingLevel }) {
  const { t } = useTranslation();
  const reached = SCALE.indexOf(level);
  return (
    <View
      accessible
      accessibilityLabel={t('onboarding.placement.result.skillLevel', { skill: name, level })}
      className="gap-1.5"
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="labelSmall" className="flex-1">
          {name}
        </Text>
        <Text variant="labelSmall" tone="primary">
          {level}
        </Text>
      </View>
      <View aria-hidden className="flex-row gap-1">
        {SCALE.slice(1).map((step, i) => (
          <View
            key={step}
            style={{ height: size.progressHeight }}
            className={`flex-1 rounded-sm ${i < reached ? 'bg-primary' : 'bg-track'}`}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * The level per skill that a placement test measured (the result screen 4.6, Today's level
 * card). A skill the test did not rate is shown at `fallback`, the overall level.
 */
export function SkillLevels({
  levels,
  fallback,
}: {
  levels: Partial<Record<string, StartingLevel>>;
  fallback: StartingLevel;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-3.5">
      {SKILLS.map((skill) => (
        <SkillRow
          key={skill}
          name={t(`onboarding.placement.result.skills.${skill}`)}
          level={levels[skill] ?? fallback}
        />
      ))}
    </View>
  );
}
