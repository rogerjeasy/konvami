import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ProfileChange } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { Button } from '@/components/button';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { StepHeader } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { ESSENTIAL_STEPS, type EssentialStep } from '@/onboarding/essentials';
import { OnboardingGate } from '@/onboarding/gate';
import { STEP_ROUTES } from '@/onboarding/routing';
import { useOnboardingStore } from '@/onboarding/services';
import type { OnboardingData } from '@/onboarding/store';

/** A step opened from the review screen saves and returns there instead of moving forward. */
function useEditingFromReview(): boolean {
  return useLocalSearchParams<{ from?: string }>().from === 'review';
}

function useStepHeader(step: EssentialStep) {
  const editing = useEditingFromReview();
  const index = ESSENTIAL_STEPS.indexOf(step);
  const previous = ESSENTIAL_STEPS[index - 1];
  return (
    <StepHeader
      step={index + 1}
      total={ESSENTIAL_STEPS.length}
      onBack={() =>
        editing ? router.back() : backOr(previous ? STEP_ROUTES[previous] : ROUTES.allSet)
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
  const editing = useEditingFromReview();
  const header = useStepHeader(step);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      await store.save(changes());
      if (editing) {
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
