import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { OptionCard } from '@/components/option-card';
import { Reveal } from '@/components/motion';
import { stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { languageName, nativeLanguageName } from '@/onboarding/names';
import type { OnboardingData } from '@/onboarding/store';
import { StepFrame, StepGate } from './step';

function LanguageForm({ data }: { data: OnboardingData }) {
  const { t } = useTranslation();
  const [language, setLanguage] = useState(data.essentials.targetLanguage);
  return (
    <StepFrame
      step="language"
      title={t('onboarding.language.title')}
      body={t('onboarding.language.body')}
      complete={language !== null}
      changes={() => [{ field: 'target_language', value: language }]}
    >
      <View accessibilityRole="radiogroup" className="gap-2.5">
        {data.catalog.languages.map(({ code, available }, i) => {
          const ownName = nativeLanguageName(data.catalog, code);
          const translated = languageName(data.catalog, code, t);
          return (
            <Reveal key={code} delay={staggerDelay(i + 1)}>
              <OptionCard
                role="radio"
                label={ownName}
                // "English / English" would say the same thing twice.
                description={translated === ownName ? undefined : translated}
                badge={available ? undefined : t('onboarding.comingSoon')}
                disabled={!available}
                selected={language === code}
                onPress={() => {
                  stepFeedback();
                  setLanguage(code);
                }}
              />
            </Reveal>
          );
        })}
      </View>
    </StepFrame>
  );
}

/** 4.2 · Step 1: the language to learn. Only languages with a language pack can be chosen. */
export function LanguageStep() {
  return <StepGate step="language">{(data) => <LanguageForm data={data} />}</StepGate>;
}
