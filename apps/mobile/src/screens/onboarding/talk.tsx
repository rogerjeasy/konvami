import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { CallStage } from '@/components/call-stage';
import { ProgressChips } from '@/components/progress-chips';
import { HeaderButton } from '@/components/step-header';
import { TextButton } from '@/components/text-button';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { firstOpenStep, openTopics, SETUP_TOPICS } from '@/onboarding/essentials';
import { STEP_ROUTES } from '@/onboarding/routing';
import { useOnboarding, useOnboardingStore } from '@/onboarding/services';
import { SETUP } from '@/screens/create-account/sample-content';
import { useMinutesBack } from '@/profile/services';
import { withLine } from '@/voice/problems';
import { useVoiceCall, type CallProblem } from '@/voice/use-voice-call';

/** Failures with their own explanation; anything else reads as the general message. */
const PROBLEM_KEY = {
  mic_denied: 'onboarding.talk.problems.mic_denied',
  no_microphone: 'onboarding.talk.problems.no_microphone',
  unsupported: 'onboarding.talk.problems.unsupported',
  consent_required: 'onboarding.talk.problems.consent_required',
  minutes_used_up: 'onboarding.talk.problems.minutes_used_up',
  voice_paused: 'onboarding.talk.problems.voice_paused',
  voice_unavailable: 'onboarding.talk.problems.voice_unavailable',
  lost: 'onboarding.talk.problems.lost',
  network: 'errors.network',
} as const satisfies Partial<Record<CallProblem, string>>;

const problemKey = (problem: CallProblem) =>
  problem in PROBLEM_KEY ? PROBLEM_KEY[problem as keyof typeof PROBLEM_KEY] : 'errors.unknown';

/** One live call with the setup guide. Mounted anew for every attempt (see `TalkScreen`). */
function Call({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const store = useOnboardingStore();
  const onboarding = useOnboarding();
  const call = useVoiceCall('onboarding');
  const { conversation } = call;
  const name = SETUP.guide.name;
  const [leaving, setLeaving] = useState(false);
  const minutesBack = useMinutesBack(call.problem === 'minutes_used_up');

  // What was answered before the call ticks the checklist until the server reports during it.
  useEffect(() => {
    void store.load();
  }, [store]);

  /** Ends the call, reads what the server saved during it, and goes where `to` says. */
  const leave = useCallback(
    async (to: (missing: readonly string[]) => Href) => {
      call.stop();
      await store.reload();
      router.replace(to(store.getState().data?.status.missing ?? []));
    },
    [call, store],
  );
  const toForm = () => {
    commitFeedback();
    setLeaving(true);
    void leave((missing) => {
      const open = firstOpenStep(missing);
      return open ? STEP_ROUTES[open] : ROUTES.onboardingReview;
    });
  };

  // Everything is saved and the goodbye has been heard: on to the summary.
  const { over } = conversation;
  useEffect(() => {
    if (!over) return;
    successFeedback();
    void leave(() => ROUTES.onboardingReview);
  }, [over, leave]);

  const stillOpen =
    conversation.stillOpen ??
    (onboarding.phase === 'ready' ? openTopics(onboarding.data.status.missing) : SETUP_TOPICS);

  return (
    <CallStage
      call={call}
      persona={SETUP.guide}
      hint={t('onboarding.talk.hint', { name })}
      finishedLabel={t('onboarding.talk.finished')}
      problem={call.problem ? withLine(t(problemKey(call.problem)), minutesBack) : null}
      header={
        <View className="min-h-tap flex-row items-center justify-between gap-3 pb-2">
          <HeaderButton
            icon="close"
            label={t('onboarding.talk.end')}
            onPress={() => {
              call.stop();
              void store.reload();
              backOr(ROUTES.allSet);
            }}
          />
          <TextButton tone="primary" label={t('onboarding.talk.typeInstead')} onPress={toForm} />
        </View>
      }
      progress={
        <ProgressChips
          items={SETUP_TOPICS.map((topic) => {
            const done = !stillOpen.includes(topic);
            const label = t(`onboarding.talk.topics.${topic}`);
            return {
              key: topic,
              label,
              done,
              accessibilityLabel: t(
                done ? 'onboarding.talk.topicSaved' : 'onboarding.talk.topicOpen',
                { topic: label },
              ),
            };
          })}
        />
      }
      failedActions={
        <>
          <Button label={t('onboarding.talk.useForm')} loading={leaving} onPress={toForm} />
          <TextButton tone="primary" label={t('onboarding.talk.retry')} onPress={onRetry} />
        </>
      }
    />
  );
}

/**
 * 4.1 Talk with Mia: the spoken setup (spec §6.1.1). The guide asks the essential questions and
 * the server saves each answer as it is given; the screen shows who is speaking, what was said
 * and which questions are done. Typing instead is always one tap away.
 */
export function TalkScreen() {
  const { status } = useSession();
  // Each attempt is a fresh call: a new key mounts `Call`, and its state, anew.
  const [attempt, setAttempt] = useState(0);
  // The spoken setup writes to an account's profile: without one there is nothing to set up.
  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  return <Call key={attempt} onRetry={() => setAttempt((count) => count + 1)} />;
}
