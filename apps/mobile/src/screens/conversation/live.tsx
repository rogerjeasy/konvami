import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Persona } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { CallStage } from '@/components/call-stage';
import { LoadState } from '@/components/load-state';
import { NoticeBox } from '@/components/notice-box';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useCountdown } from '@/hooks/use-countdown';
import { formatDuration } from '@/lib/format';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { backOr } from '@/lib/navigation';
import { conversationDoneRoute, ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';
import { useVoiceCall, type CallProblem } from '@/voice/use-voice-call';

/** Failures with their own explanation; anything else reads as the general message. */
const PROBLEM_KEY = {
  mic_denied: 'conversation.problems.mic_denied',
  no_microphone: 'conversation.problems.no_microphone',
  unsupported: 'conversation.problems.unsupported',
  consent_required: 'conversation.problems.consent_required',
  call_limit: 'conversation.problems.call_limit',
  voice_unavailable: 'conversation.problems.voice_unavailable',
  network: 'errors.network',
} as const satisfies Partial<Record<CallProblem, string>>;

const problemKey = (problem: CallProblem) =>
  problem in PROBLEM_KEY ? PROBLEM_KEY[problem as keyof typeof PROBLEM_KEY] : 'errors.unknown';

/** Failures that another try right away cannot get past: the way back leads, not "Try again". */
const FINAL: readonly CallProblem[] = [
  'call_limit',
  'unsupported',
  'consent_required',
  'no_microphone',
];

/** The top row of this screen while there is nothing to put in it. */
const EMPTY_HEADER = <View className="min-h-tap" />;

const toToday = () => router.dismissTo(ROUTES.today);

/** How long the call may still last. It counts from the moment it is shown: when the call goes live. */
function TimeLeft({ seconds }: { seconds: number }) {
  const { t } = useTranslation();
  const { secondsLeft } = useCountdown(seconds);
  return (
    <Text variant="labelSmall" tone="subtle">
      {t('conversation.timeLeft', { time: formatDuration(secondsLeft) })}
    </Text>
  );
}

/** One live call with a partner. Mounted anew for every attempt (see `LiveConversationScreen`). */
function Call({ partner, onRetry }: { partner: Persona; onRetry: () => void }) {
  const { t } = useTranslation();
  const call = useVoiceCall('practice', partner.id);
  const { conversation, callId, stop } = call;

  /** Ends the call and shows what it added up to; a call that never connected just closes. */
  const leave = useCallback(() => {
    stop();
    if (callId) router.replace(conversationDoneRoute(callId));
    else backOr(ROUTES.today);
  }, [stop, callId]);

  // The partner has said goodbye and it has been heard.
  const { over } = conversation;
  useEffect(() => {
    if (!over) return;
    successFeedback();
    leave();
  }, [over, leave]);

  // The server ends a call when its time is up, and a connection can drop. Either way what
  // was said is saved, so a call that had begun ends on its summary, not on an error.
  const lost = call.problem === 'lost' && callId !== null;
  useEffect(() => {
    if (lost) leave();
  }, [lost, leave]);

  return (
    <CallStage
      call={call}
      persona={partner}
      hint={t('conversation.hint', { name: partner.name })}
      finishedLabel={t('conversation.finished')}
      problem={call.problem && !lost ? t(problemKey(call.problem)) : null}
      header={
        <View className="min-h-tap flex-row items-center justify-end pb-2">
          {call.status === 'live' && call.maxSeconds ? (
            <TimeLeft seconds={call.maxSeconds} />
          ) : null}
        </View>
      }
      mainAction={
        <Button
          variant="secondary"
          label={t('conversation.end')}
          onPress={() => {
            commitFeedback();
            leave();
          }}
        />
      }
      failedActions={
        call.problem && FINAL.includes(call.problem) ? (
          <Button label={t('conversation.back')} onPress={toToday} />
        ) : (
          <>
            <Button label={t('conversation.retry')} onPress={onRetry} />
            <TextButton tone="primary" label={t('conversation.back')} onPress={toToday} />
          </>
        )
      }
    />
  );
}

/**
 * 5.3 Conversation: a live practice conversation with one of the learner's partners (spec §6.4).
 * The partner speaks first; the screen shows who is speaking, the latest line of each side and
 * how much time is left. It ends when the learner ends it, when the partner has said goodbye,
 * or when the time is up, and then shows what it added up to.
 */
export function LiveConversationScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { personaId } = useLocalSearchParams<{ personaId: string }>();
  const { home: store } = usePracticeServices();
  const home = useHome();
  // Each attempt is a fresh call: a new key mounts `Call`, and its state, anew.
  const [attempt, setAttempt] = useState(0);
  const signedIn = status === 'signedIn';

  // The partner's name and look come with Today's data, which is usually there already.
  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  if (home.phase !== 'ready') {
    return (
      <StepLayout header={EMPTY_HEADER}>
        <LoadState
          failed={home.phase === 'failed'}
          loadingLabel={t('call.status.connecting')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            home.error === 'network' ? 'errors.network' : 'onboarding.partners.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      </StepLayout>
    );
  }

  const partner = home.data.partners.find(({ persona }) => persona.id === personaId)?.persona;
  if (!partner) {
    return (
      <StepLayout
        header={EMPTY_HEADER}
        actions={<Button label={t('conversation.back')} onPress={toToday} />}
      >
        <NoticeBox icon="info">{t('conversation.problems.not_found')}</NoticeBox>
      </StepLayout>
    );
  }
  return <Call key={attempt} partner={partner} onRetry={() => setAttempt((count) => count + 1)} />;
}
