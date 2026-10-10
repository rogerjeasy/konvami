import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PersonaPersonality } from '@konvami/api-client';
import { Reveal } from '@/components/motion';
import { OptionCard } from '@/components/option-card';
import { Scale } from '@/components/scale';
import { stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { FORMS_OF_ADDRESS, STYLES, TRAITS } from '@/profile/persona-draft';
import { Block, type SectionProps } from './shared';

/**
 * What the partner is like (spec §6.2 C): five traits between two poles, how they address the
 * learner, and how they keep a conversation going.
 */
export function PersonalitySection({ draft, change }: SectionProps) {
  const { t } = useTranslation();
  const { personality } = draft;
  const set = (changes: Partial<PersonaPersonality>) => {
    stepFeedback();
    change({ personality: { ...personality, ...changes } });
  };

  return (
    <>
      <Reveal delay={staggerDelay(1)}>
        <View className="gap-5">
          {TRAITS.map((trait) => (
            <Scale
              key={trait}
              label={t(`partners.studio.personality.traits.${trait}.label`)}
              low={t(`partners.studio.personality.traits.${trait}.low`)}
              high={t(`partners.studio.personality.traits.${trait}.high`)}
              value={personality[trait]}
              // The scale gives its own feedback.
              onChange={(value) => change({ personality: { ...personality, [trait]: value } })}
            />
          ))}
        </View>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <Block label={t('partners.studio.personality.address')}>
          <View accessibilityRole="radiogroup" className="gap-2.5">
            {FORMS_OF_ADDRESS.map((form) => (
              <OptionCard
                key={form}
                role="radio"
                label={t(`partners.studio.personality.addresses.${form}`)}
                description={t(`partners.studio.personality.addressHints.${form}`)}
                selected={personality.formOfAddress === form}
                onPress={() => set({ formOfAddress: form })}
              />
            ))}
          </View>
        </Block>
      </Reveal>
      <Reveal delay={staggerDelay(3)}>
        <Block label={t('partners.studio.personality.style')}>
          <View accessibilityRole="radiogroup" className="gap-2.5">
            {STYLES.map((style) => (
              <OptionCard
                key={style}
                role="radio"
                label={t(`partners.studio.personality.styles.${style}.label`)}
                description={t(`partners.studio.personality.styles.${style}.hint`)}
                selected={personality.style === style}
                onPress={() => set({ style })}
              />
            ))}
          </View>
        </Block>
      </Reveal>
    </>
  );
}
