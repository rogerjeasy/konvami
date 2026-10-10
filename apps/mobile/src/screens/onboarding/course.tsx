import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Reveal } from '@/components/motion';
import { OptionCard } from '@/components/option-card';
import { TextField } from '@/components/text-field';
import { stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import type { OnboardingData } from '@/onboarding/store';
import { StepFrame, StepGate } from './step';

// The longest name and chapter the profile accepts (services/api: domain/profile.py).
const NAME_MAX = 120;
const CHAPTER_MAX = 60;

function CourseForm({ data }: { data: OnboardingData }) {
  const { t } = useTranslation();
  const earlier = data.essentials.course;
  // `undefined` until the question is answered; then whether the learner follows a course.
  const [following, setFollowing] = useState<boolean | undefined>(
    earlier === undefined ? undefined : earlier !== null,
  );
  const [name, setName] = useState(earlier?.name ?? '');
  const [chapter, setChapter] = useState(earlier?.chapter ?? '');

  const choose = (answer: boolean) => {
    stepFeedback();
    setFollowing(answer);
  };

  return (
    <StepFrame
      step="course"
      title={t('onboarding.course.title')}
      body={t('onboarding.course.body')}
      complete={following === false || (following === true && name.trim().length > 0)}
      changes={() => [
        {
          field: 'course',
          value: following ? { name: name.trim(), chapter: chapter.trim() || null } : null,
        },
      ]}
    >
      <Reveal delay={staggerDelay(1)}>
        <View accessibilityRole="radiogroup" className="gap-2.5">
          <OptionCard
            role="radio"
            label={t('onboarding.course.yes')}
            selected={following === true}
            onPress={() => choose(true)}
          />
          <OptionCard
            role="radio"
            label={t('onboarding.course.no')}
            selected={following === false}
            onPress={() => choose(false)}
          />
        </View>
      </Reveal>

      {following ? (
        <Reveal>
          <View className="gap-4">
            <TextField
              label={t('onboarding.course.name')}
              placeholder={t('onboarding.course.namePlaceholder')}
              value={name}
              onChangeText={setName}
              maxLength={NAME_MAX}
              autoCapitalize="sentences"
              returnKeyType="next"
            />
            <TextField
              label={t('onboarding.course.chapter')}
              placeholder={t('onboarding.course.chapterPlaceholder')}
              value={chapter}
              onChangeText={setChapter}
              maxLength={CHAPTER_MAX}
              returnKeyType="done"
            />
          </View>
        </Reveal>
      ) : null}
    </StepFrame>
  );
}

/** 4.2 · Step 5: the course or textbook the learner follows, if any (spec D2). */
export function CourseStep() {
  return <StepGate step="course">{(data) => <CourseForm data={data} />}</StepGate>;
}
