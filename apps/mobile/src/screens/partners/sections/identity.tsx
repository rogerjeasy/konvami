import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup } from '@/components/choice-group';
import { Reveal } from '@/components/motion';
import { OptionCard } from '@/components/option-card';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import {
  AGE_MAX,
  AGE_MIN,
  BACKSTORY_MAX,
  GENDERS,
  NAME_MAX,
  OCCUPATION_MAX,
  ORIGIN_MAX,
  ROLES,
  TAGLINE_MAX,
  withRole,
} from '@/profile/persona-draft';
import { Block, type SectionProps } from './shared';

// Lines the story field shows before it scrolls.
const BACKSTORY_LINES = 4;
// Rows the one-line description may take.
const TAGLINE_LINES = 2;
// An age has two digits.
const AGE_DIGITS = 2;

/** Who the partner is: name, what they are for, gender, age, where they are from, their story. */
export function IdentitySection({ draft, change, problems }: SectionProps) {
  const { t } = useTranslation();
  // The age as typed, so the field can be empty while the learner retypes it.
  const [age, setAge] = useState(String(draft.age));
  const problem = (field: (typeof problems)[number]) =>
    problems.includes(field)
      ? t(`partners.studio.missing.${field}`, { min: AGE_MIN, max: AGE_MAX })
      : undefined;

  return (
    <>
      <Reveal delay={staggerDelay(1)}>
        <TextField
          label={t('partners.studio.identity.name')}
          value={draft.name}
          onChangeText={(name) => change({ name })}
          error={problem('name')}
          maxLength={NAME_MAX}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <Block label={t('partners.studio.identity.role')}>
          <View accessibilityRole="radiogroup" className="gap-2.5">
            {ROLES.map((role) => (
              <OptionCard
                key={role}
                role="radio"
                label={t(`onboarding.partners.roles.${role}`)}
                description={t(`onboarding.partners.roleLines.${role}`)}
                selected={draft.role === role}
                onPress={() => {
                  stepFeedback();
                  change(withRole(draft, role));
                }}
              />
            ))}
          </View>
        </Block>
      </Reveal>
      <Reveal delay={staggerDelay(3)}>
        <View className="gap-4">
          <ChoiceGroup chips label={t('partners.studio.identity.gender')}>
            {GENDERS.map((gender) => (
              <ChoiceChip
                key={gender}
                label={t(`partners.studio.identity.genders.${gender}`)}
                selected={draft.gender === gender}
                onPress={() => {
                  stepFeedback();
                  change({ gender });
                }}
              />
            ))}
          </ChoiceGroup>
          <TextField
            label={t('partners.studio.identity.age')}
            value={age}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '');
              setAge(digits);
              change({ age: digits ? Number(digits) : Number.NaN });
            }}
            error={problem('age')}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={AGE_DIGITS}
          />
          <TextField
            label={t('partners.studio.identity.origin')}
            placeholder={t('partners.studio.identity.originPlaceholder')}
            value={draft.origin}
            onChangeText={(origin) => change({ origin })}
            error={problem('origin')}
            maxLength={ORIGIN_MAX}
            autoCapitalize="words"
          />
          <TextField
            label={t('partners.studio.identity.occupation')}
            placeholder={t('partners.studio.identity.occupationPlaceholder')}
            value={draft.occupation}
            onChangeText={(occupation) => change({ occupation })}
            maxLength={OCCUPATION_MAX}
          />
          <TextField
            label={t('partners.studio.identity.tagline')}
            placeholder={t('partners.studio.identity.taglinePlaceholder')}
            value={draft.tagline ?? ''}
            onChangeText={(tagline) => change({ tagline })}
            maxLength={TAGLINE_MAX}
            // A line of up to 120 characters: shown whole, on two rows, rather than cut off.
            multiline
            numberOfLines={TAGLINE_LINES}
            textAlignVertical="top"
          />
        </View>
      </Reveal>
      <Reveal delay={staggerDelay(4)}>
        <View className="gap-1.5">
          <TextField
            label={t('partners.studio.identity.backstory')}
            placeholder={t('partners.studio.identity.backstoryPlaceholder')}
            value={draft.backstory}
            onChangeText={(backstory) => change({ backstory })}
            error={problem('backstory')}
            maxLength={BACKSTORY_MAX}
            multiline
            numberOfLines={BACKSTORY_LINES}
            textAlignVertical="top"
          />
          {problem('backstory') ? null : (
            <Text variant="small" tone="subtle">
              {t('partners.studio.identity.backstoryHint')}
            </Text>
          )}
        </View>
      </Reveal>
    </>
  );
}
