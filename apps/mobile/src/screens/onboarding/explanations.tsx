import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { PressScale, Reveal } from '@/components/motion';
import { OptionCard } from '@/components/option-card';
import { ChoiceRow, Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { DEFAULT_LANGUAGE, isLanguage, SUPPORTED_LANGUAGES } from '@/i18n/languages';
import { stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { languageInText, nativeLanguageName } from '@/onboarding/names';
import type { OnboardingData } from '@/onboarding/store';
import { useTheme } from '@/theme';
import { StepFrame, StepGate } from './step';

// The list of all languages takes at most this share of the window height, then scrolls.
const LIST_MAX_HEIGHT_RATIO = 0.6;

function ExplanationsForm({ data }: { data: OnboardingData }) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { height } = useWindowDimensions();
  const { catalog, essentials } = data;
  const [language, setLanguage] = useState(essentials.explanationLanguage);
  const [usage, setUsage] = useState(essentials.explanationUsage);
  const [listOpen, setListOpen] = useState(false);

  const appLanguage = isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  // The app's own languages, the current one first; a language picked from the full list joins them.
  const shortlist: string[] = [
    appLanguage,
    ...SUPPORTED_LANGUAGES.filter((code) => code !== appLanguage),
  ];
  if (language && !shortlist.includes(language)) shortlist.push(language);
  const target = languageInText(catalog, essentials.targetLanguage ?? '', t);

  const choose = (code: string) => {
    stepFeedback();
    setLanguage(code);
    setListOpen(false);
  };

  return (
    <StepFrame
      step="explanations"
      title={t('onboarding.explanations.title')}
      body={t('onboarding.explanations.body')}
      complete={language !== null && usage !== null}
      changes={() => [
        { field: 'explanation_language', value: language },
        { field: 'explanation_usage', value: usage },
      ]}
    >
      <Reveal delay={staggerDelay(1)}>
        <View className="gap-2.5">
          <View accessibilityRole="radiogroup" className="gap-2.5">
            {shortlist.map((code) => (
              <OptionCard
                key={code}
                role="radio"
                label={nativeLanguageName(catalog, code)}
                badge={code === appLanguage ? t('onboarding.explanations.appLanguage') : undefined}
                selected={language === code}
                onPress={() => choose(code)}
              />
            ))}
          </View>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.explanations.more')}
            onPress={() => setListOpen(true)}
          >
            <View className="min-h-button flex-row items-center justify-between gap-3 rounded-card border border-dashed border-field-border px-3.5 py-3">
              <View className="flex-1 flex-row items-center gap-3">
                <Icon name="globe" color={color.fgMuted} size={size.iconMd} />
                <Text variant="label" tone="muted" className="shrink">
                  {t('onboarding.explanations.more')}
                </Text>
              </View>
              <Icon name="chevronRight" color={color.fgSubtle} size={size.iconMd} />
            </View>
          </PressScale>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(2)}>
        <View className="gap-3">
          <Text variant="heading" accessibilityRole="header">
            {t('onboarding.explanations.usageTitle')}
          </Text>
          <View accessibilityRole="radiogroup" className="gap-2.5">
            {catalog.explanationUsages.map((option) => (
              <OptionCard
                key={option}
                role="radio"
                label={t(`onboarding.explanations.usage.${option}.label`)}
                description={t(`onboarding.explanations.usage.${option}.hint`, { target })}
                selected={usage === option}
                onPress={() => {
                  stepFeedback();
                  setUsage(option);
                }}
              />
            ))}
          </View>
        </View>
      </Reveal>

      <Sheet
        visible={listOpen}
        title={t('onboarding.explanations.listTitle')}
        onClose={() => setListOpen(false)}
      >
        <ScrollView style={{ maxHeight: height * LIST_MAX_HEIGHT_RATIO }}>
          <View accessibilityRole="radiogroup" className="gap-1 pb-2">
            {catalog.explanationLanguages.map(({ code, name }) => (
              <ChoiceRow
                key={code}
                label={name}
                selected={language === code}
                onPress={() => choose(code)}
              />
            ))}
          </View>
        </ScrollView>
      </Sheet>
    </StepFrame>
  );
}

/**
 * 4.2 · Step 2: the language for explanations and how much personas may use it (spec D1). The
 * app's own languages are offered first; any other comes from the full list.
 */
export function ExplanationsStep() {
  return <StepGate step="explanations">{(data) => <ExplanationsForm data={data} />}</StepGate>;
}
