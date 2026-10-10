import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { ProgressChips } from '@/components/progress-chips';
import { HeaderButton } from '@/components/step-header';
import { TextButton } from '@/components/text-button';
import { commitFeedback, stepFeedback, successFeedback } from '@/lib/haptics';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { useOnboardingStore } from '@/onboarding/services';
import { SETUP } from '@/screens/create-account/sample-content';
import { useVoiceCall, type CallProblem } from '@/voice/use-voice-call';
import { CallStage } from './call-stage';

/**
 * The parts of the test, in the order the examiner runs them (services/api:
 * domain/placement.py). She notes each task by these names when it is done; a part she repeats
 * (an easier warm-up, a second follow-up) is ticked once.
 */
const TASKS = ['warm_up', 'listening', 'description', 'opinion', 'follow_up'] as const;

/** Failures with their own explanation; anything else reads as the general message. */
const PROBLEM_KEY = {
  mic_denied: 'onboarding.placement.talk.problems.mic_denied',
  no_microphone: 'onboarding.placement.talk.problems.no_microphone',
  unsupported: 'onboarding.placement.talk.problems.unsupported',
  consent_required: 'onboarding.placement.talk.problems.consent_required',
  call_limit: 'onboarding.placement.talk.problems.call_limit',
  voice_unavailable: 'onboarding.placement.talk.problems.voice_unavailable',
  lost: 'onboarding.placement.talk.problems.lost',
  network: 'errors.network',
} as const satisfies Partial<Record<CallProblem, string>>;

const problemKey = (problem: CallProblem) =>
  problem in PROBLEM_KEY ? PROBLEM_KEY[problem as keyof typeof PROBLEM_KEY] : 'errors.unknown';

/** One test call. Mounted anew for every attempt (see `PlacementTalkScreen`). */
function Test({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const store = useOnboardingStore();
  const call = useVoiceCall('placement');
  const { conversation } = call;
  const name = SETUP.guide.name;
  const [skipping, setSkipping] = useState(false);
  const [skipProblem, setSkipProblem] = useState<string | null>(null);

  /** Ends the call and opens the result, which waits there for the assessment. */
  const toResult = useCallback(() => {
    call.stop();
    router.replace(ROUTES.onboardingPlacementResult);
  }, [call]);

  // The test is over and the goodbye has been heard.
  const { over } = conversation;
  useEffect(() => {
    if (!over) return;
    successFeedback();
    toResult();
  }, [over, toResult]);

  async function skip() {
    commitFeedback();
    setSkipProblem(null);
    setSkipping(true);
    try {
      await store.skipPlacement();
      router.replace(ROUTES.onboardingPartners);
    } catch (error) {
      setSkipProblem(t(apiErrorKey(apiErrorCode(error))));
    } finally {
      setSkipping(false);
    }
  }

  const live = call.status === 'live';
  // A typed line can only be taken while it is the learner's turn: the provider refuses one
  // while the examiner is still answering.
  const learnersTurn = live && ['listening', 'hearing'].includes(conversation.phase);
  const callProblem = call.problem ? t(problemKey(call.problem)) : null;

  return (
    <CallStage
      call={call}
      hint={t('onboarding.placement.talk.hint', { name })}
      finishedLabel={t('onboarding.placement.talk.finished')}
      problem={skipProblem ?? callProblem}
      header={
        <View className="min-h-tap flex-row items-center pb-2">
          <HeaderButton
            icon="close"
            label={t('onboarding.placement.talk.end')}
            onPress={() => {
              // A test that has begun is followed up on its result screen; before that there
              // is nothing to follow up.
              if (live) toResult();
              else {
                call.stop();
                backOr(ROUTES.onboardingPlacement);
              }
            }}
          />
        </View>
      }
      progress={
        <ProgressChips
          items={TASKS.map((task) => {
            const done = conversation.tasksDone.includes(task);
            const label = t(`onboarding.placement.talk.tasks.${task}`);
            return {
              key: task,
              label,
              done,
              accessibilityLabel: t(
                done ? 'onboarding.placement.talk.taskDone' : 'onboarding.placement.talk.taskOpen',
                { task: label },
              ),
            };
          })}
        />
      }
      mainAction={
        <Button
          variant="secondary"
          label={t('onboarding.placement.talk.dontKnow')}
          disabled={!learnersTurn || conversation.finished}
          onPress={() => {
            stepFeedback();
            call.say(t('onboarding.placement.talk.dontKnow'));
          }}
        />
      }
      failedActions={
        <>
          <Button label={t('onboarding.placement.talk.retry')} onPress={onRetry} />
          <TextButton
            tone="primary"
            label={t('onboarding.placement.talk.skip')}
            disabled={skipping}
            onPress={skip}
          />
        </>
      }
    />
  );
}

/**
 * 4.5 Placement test: the live spoken test (spec §6.1.1 step 4). The examiner adapts to the
 * learner and notes each task on the server; the screen shows who is speaking, the parts that
 * are done, and a way to say "I don't know" without having to find the words.
 */
export function PlacementTalkScreen() {
  const { status } = useSession();
  // Each attempt is a fresh call: a new key mounts `Test`, and its state, anew.
  const [attempt, setAttempt] = useState(0);
  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  return <Test key={attempt} onRetry={() => setAttempt((count) => count + 1)} />;
}
