import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Reveal } from '@/components/motion';
import { OptionCard } from '@/components/option-card';
import { stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { practiceLevel } from '@/onboarding/answers';
import { languageInText } from '@/onboarding/names';
import type { OnboardingData } from '@/onboarding/store';
import { StepFrame, StepGate, useEditOrigin } from './step';

function LevelForm({ data }: { data: OnboardingData }) {
  const { t } = useTranslation();
  const { catalog, essentials } = data;
  // In the profile, long after the placement test, "my level" is the one practice runs at.
  const settled = useEditOrigin() === 'profile';
  const [level, setLevel] = useState(settled ? practiceLevel(data) : essentials.selfAssessedLevel);
  const language = languageInText(catalog, essentials.targetLanguage ?? '', t);
  return (
    <StepFrame
      step="level"
      title={t('onboarding.level.title', { language })}
      body={t('onboarding.level.body')}
      complete={level !== null}
      changes={() => [
        { field: 'self_assessed_level', value: level },
        // During the setup the starting level is settled later, with the placement test.
        ...(settled ? [{ field: 'starting_level', value: level }] : []),
      ]}
    >
      <View accessibilityRole="radiogroup" className="gap-2.5">
        {catalog.startingLevels.map((option, i) => (
          <Reveal key={option} delay={staggerDelay(i + 1)}>
            <OptionCard
              role="radio"
              label={t(`onboarding.level.levels.${option}.label`)}
              description={t(`onboarding.level.levels.${option}.hint`)}
              selected={level === option}
              onPress={() => {
                stepFeedback();
                setLevel(option);
              }}
            />
          </Reveal>
        ))}
      </View>
    </StepFrame>
  );
}

/**
 * 4.2 · Step 4: the learner's own estimate of their level, with a can-do line per level
 * (spec D2). The placement test can confirm it afterwards.
 */
export function LevelStep() {
  return <StepGate step="level">{(data) => <LevelForm data={data} />}</StepGate>;
}
