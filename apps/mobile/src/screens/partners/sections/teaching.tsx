import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PersonaTeaching } from '@konvami/api-client';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup } from '@/components/choice-group';
import { Reveal } from '@/components/motion';
import { OptionCard } from '@/components/option-card';
import { TextButton } from '@/components/text-button';
import { TextField } from '@/components/text-field';
import { stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import {
  CORRECTION_TIMINGS,
  FOCUS_MAX,
  ROLE_TEACHING,
  STRICTNESSES,
} from '@/profile/persona-draft';
import { Block, type SectionProps } from './shared';

/** How much of the learner's own language a partner may use; null follows the profile. */
const USAGES = [null, 'never', 'when_stuck', 'for_grammar', 'freely'] as const;
/** The level a partner speaks at; null follows the learner's own. */
const LEVELS = [null, 'A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
/** Only these ways of correcting pick out some mistakes; the others treat all alike. */
const SELECTIVE: readonly PersonaTeaching['correctionTiming'][] = ['immediate', 'end'];

/**
 * How the partner helps the learner learn (spec §6.2 E): when and what they correct, how much
 * of the learner's own language they use, the level they speak at, and something to practise.
 * It starts as their role usually does.
 */
export function TeachingSection({ draft, change }: SectionProps) {
  const { t } = useTranslation();
  const { teaching } = draft;
  const usual = ROLE_TEACHING[draft.role];
  const isUsual =
    teaching.correctionTiming === usual.correctionTiming &&
    teaching.strictness === usual.strictness;
  const set = (changes: Partial<PersonaTeaching>) => {
    stepFeedback();
    change({ teaching: { ...teaching, ...changes } });
  };

  return (
    <>
      <Reveal delay={staggerDelay(1)}>
        <Block label={t('partners.studio.teaching.timing')}>
          <View accessibilityRole="radiogroup" className="gap-2.5">
            {CORRECTION_TIMINGS.map((timing) => (
              <OptionCard
                key={timing}
                role="radio"
                label={t(`partners.studio.teaching.timings.${timing}.label`)}
                description={t(`partners.studio.teaching.timings.${timing}.hint`)}
                selected={teaching.correctionTiming === timing}
                onPress={() => set({ correctionTiming: timing })}
              />
            ))}
          </View>
          {SELECTIVE.includes(teaching.correctionTiming) ? (
            <ChoiceGroup chips label={t('partners.studio.teaching.strictness')}>
              {STRICTNESSES.map((strictness) => (
                <ChoiceChip
                  key={strictness}
                  label={t(`partners.studio.teaching.strictnesses.${strictness}`)}
                  selected={teaching.strictness === strictness}
                  onPress={() => set({ strictness })}
                />
              ))}
            </ChoiceGroup>
          ) : null}
          {isUsual ? null : (
            <View className="items-start">
              <TextButton
                tone="primary"
                label={t('partners.studio.teaching.usual')}
                onPress={() =>
                  set({
                    correctionTiming: usual.correctionTiming,
                    strictness: usual.strictness,
                  })
                }
              />
            </View>
          )}
        </Block>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <View className="gap-4">
          <ChoiceGroup chips label={t('partners.studio.teaching.explanations')}>
            {USAGES.map((usage) => (
              <ChoiceChip
                key={usage ?? 'profile'}
                label={
                  usage === null
                    ? t('partners.studio.teaching.asProfile')
                    : t(`onboarding.explanations.usage.${usage}.label`)
                }
                selected={teaching.explanationUsage === usage}
                onPress={() => set({ explanationUsage: usage })}
              />
            ))}
          </ChoiceGroup>
          <ChoiceGroup chips label={t('partners.studio.teaching.level')}>
            {LEVELS.map((level) => (
              <ChoiceChip
                key={level ?? 'own'}
                label={level ?? t('partners.studio.teaching.levelAuto')}
                selected={teaching.level === level}
                onPress={() => set({ level })}
              />
            ))}
          </ChoiceGroup>
        </View>
      </Reveal>
      <Reveal delay={staggerDelay(3)}>
        <TextField
          label={t('partners.studio.teaching.focus')}
          placeholder={t('partners.studio.teaching.focusPlaceholder')}
          value={teaching.focus ?? ''}
          onChangeText={(focus) => change({ teaching: { ...teaching, focus } })}
          maxLength={FOCUS_MAX}
        />
      </Reveal>
    </>
  );
}
