import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ProfileChange } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { Button } from '@/components/button';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton, StepHeader } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { ESSENTIAL_STEPS, type EssentialStep } from '@/onboarding/essentials';
import { OnboardingGate } from '@/onboarding/gate';
import { STEP_ROUTES } from '@/onboarding/routing';
import { useOnboardingStore } from '@/onboarding/services';
import { usePracticeServices } from '@/practice/services';
import type { OnboardingData } from '@/onboarding/store';

/**
 * Where a step was opened from to change one answer: the review at the end of the setup, or
 * the profile (6.3), long after it. Such a step saves and returns there instead of moving
 * forward. Null while the learner is going through the setup.
 */
export function useEditOrigin(): 'review' | 'profile' | null {
  const { from } = useLocalSearchParams<{ from?: string }>();
  return from === 'review' || from === 'profile' ? from : null;
}

function useStepHeader(step: EssentialStep) {
  const { t } = useTranslation();
  const origin = useEditOrigin();
  const index = ESSENTIAL_STEPS.indexOf(step);
  const previous = ESSENTIAL_STEPS[index - 1];
  // From the profile it is one question to change, not step 4 of 5.
  if (origin === 'profile') {
    return (
      <View className="min-h-tap flex-row items-center">
        <HeaderButton
          icon="chevronLeft"
          label={t('common.back')}
          onPress={() => backOr(ROUTES.accountLearning)}
        />
      </View>
    );
  }
  return (
    <StepHeader
      step={index + 1}
      total={ESSENTIAL_STEPS.length}
      onBack={() =>
        origin ? router.back() : backOr(previous ? STEP_ROUTES[previous] : ROUTES.allSet)
      }
    />
  );
}

/** A form step once its data has loaded. Later steps need the language being learned first. */
export function StepGate({
  step,
  children,
}: {
  step: EssentialStep;
  children: (data: OnboardingData) => ReactNode;
}) {
  const header = useStepHeader(step);
  return (
    <OnboardingGate header={header}>
      {(data) =>
        step !== 'language' && !data.essentials.targetLanguage ? (
          <Redirect href={ROUTES.onboardingLanguage} />
        ) : (
          children(data)
        )
      }
    </OnboardingGate>
  );
}

/**
 * The frame of one form step: progress, the question, the choices and the button that saves.
 * The answers stay on screen when saving fails, with the reason, so they can be sent again.
 */
export function StepFrame({
  step,
  title,
  body,
  complete,
  changes,
  children,
}: {
  step: EssentialStep;
  title: string;
  body: string;
  /** Whether the step has everything it needs to be saved. */
  complete: boolean;
  /** The answers of this step, as profile changes. */
  changes: () => ProfileChange[];
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const store = useOnboardingStore();
  const { home } = usePracticeServices();
  const origin = useEditOrigin();
  const editing = origin !== null;
  const header = useStepHeader(step);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      await store.save(changes());
      if (origin === 'profile') {
        // Today shows the level, the exam and the partners' lines: it reads them again.
        void home.refresh();
        backOr(ROUTES.accountLearning);
      } else if (editing) {
        router.back();
      } else {
        const next = ESSENTIAL_STEPS[ESSENTIAL_STEPS.indexOf(step) + 1];
        router.push(next ? STEP_ROUTES[next] : ROUTES.onboardingReview);
      }
    } catch (error) {
      setProblem(t(apiErrorKey(apiErrorCode(error))));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepLayout
      header={header}
      actions={
        <>
          {problem ? (
            <View className="pb-2">
              <NoticeBox icon="alert" tone="danger">
                {problem}
              </NoticeBox>
            </View>
          ) : null}
          <Button
            label={t(editing ? 'onboarding.save' : 'common.continue')}
            disabled={!complete}
            loading={saving}
            onPress={save}
          />
        </>
      }
    >
      <Reveal>
        <View className="gap-2.5">
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          <Text tone="muted">{body}</Text>
        </View>
      </Reveal>
      {children}
    </StepLayout>
  );
}
