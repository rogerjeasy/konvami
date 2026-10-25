import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { NextSimulation } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { CallStage } from '@/components/call-stage';
import type { AvatarLook } from '@/components/avatar/look';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { ProgressChips } from '@/components/progress-chips';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { stepFeedback, successFeedback } from '@/lib/haptics';
import { backOr } from '@/lib/navigation';
import { examPrepRoute, ROUTES, simulationRoute } from '@/lib/routes';
import { useMinutesBack } from '@/profile/services';
import { useTheme } from '@/theme';
import { withLine } from '@/voice/problems';
import { useVoiceCall, type CallProblem } from '@/voice/use-voice-call';
import { ExamCard } from './exam-card';
import { useExamLabels } from './labels';
import { useExamNotes } from './notes';
import { useNextSimulation } from './use-next-simulation';

/** The examiner: neutral and formal, the same for every learner (services/api: Frau Becker). */
const EXAMINER = {
  name: 'Frau Becker',
  look: {
    skin: 'sand',
    hair: 'bun',
    hairColor: 'silver',
    top: 'graphite',
    backdrop: 'slate',
    glasses: true,
  } satisfies AvatarLook,
};

/** Failures with their own explanation (shared with the placement test, also a test call). */
const PROBLEM_KEY = {
  mic_denied: 'onboarding.placement.talk.problems.mic_denied',
  no_microphone: 'onboarding.placement.talk.problems.no_microphone',
  unsupported: 'onboarding.placement.talk.problems.unsupported',
  consent_required: 'onboarding.placement.talk.problems.consent_required',
  minutes_used_up: 'onboarding.placement.talk.problems.minutes_used_up',
  voice_paused: 'onboarding.placement.talk.problems.voice_paused',
  voice_unavailable: 'onboarding.placement.talk.problems.voice_unavailable',
  lost: 'onboarding.placement.talk.problems.lost',
  network: 'errors.network',
} as const satisfies Partial<Record<CallProblem, string>>;

const problemKey = (problem: CallProblem) =>
  problem in PROBLEM_KEY ? PROBLEM_KEY[problem as keyof typeof PROBLEM_KEY] : 'errors.unknown';

/** The learner's notes from the preparation, folded away until they are wanted. */
function Notes() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { draft } = useExamNotes();
  const [open, setOpen] = useState(false);
  if (!draft.notes.trim()) return null;
  return (
    <View className="gap-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((shown) => !shown)}
        className="min-h-tap flex-row items-center gap-2 active:opacity-pressed"
      >
        <Icon
          name={open ? 'chevronDown' : 'chevronRight'}
          color={color.primaryText}
          size={size.icon}
        />
        <Text variant="label" tone="primary">
          {t('exams.talk.notes')}
        </Text>
      </Pressable>
      {open ? (
        <Text variant="callout" tone="muted">
          {draft.notes}
        </Text>
      ) : null}
    </View>
  );
}

/** One simulation's call. Mounted anew for every attempt. */
function Test({ next, onRetry }: { next: NextSimulation; onRetry: () => void }) {
  const { t } = useTranslation();
  const labels = useExamLabels();
  const { reset } = useExamNotes();
  const { exam, cards } = next;
  const call = useVoiceCall('exam', undefined, exam.id);
  const { conversation } = call;

  /** Ends the call and opens the score, which waits there to be written. */
  const toResult = useCallback(() => {
    call.stop();
    reset();
    if (call.callId) router.replace(simulationRoute(call.callId));
    else backOr(ROUTES.exams);
  }, [call, reset]);

  const { over } = conversation;
  useEffect(() => {
    if (!over) return;
    successFeedback();
    toResult();
  }, [over, toResult]);

  const index = exam.parts.findIndex(({ id }) => id === conversation.examPart?.id);
  const part = exam.parts[index];
  const card = cards[index];
  const live = call.status === 'live';
  const minutesBack = useMinutesBack(call.problem === 'minutes_used_up');
  const problem = call.problem ? withLine(t(problemKey(call.problem)), minutesBack) : null;

  return (
    <CallStage
      compact
      call={call}
      persona={EXAMINER}
      hint={t('exams.talk.hint')}
      finishedLabel={t('exams.talk.finished')}
      problem={problem}
      header={
        <View className="min-h-tap flex-row items-center pb-2">
          <HeaderButton
            icon="close"
            label={t('exams.talk.end')}
            onPress={() => {
              if (live) toResult();
              else {
                call.stop();
                backOr(examPrepRoute(exam.id));
              }
            }}
          />
        </View>
      }
      progress={
        <View className="gap-3">
          <ProgressChips
            items={exam.parts.map((item, i) => {
              const begun = conversation.examParts.includes(item.id);
              const name = labels.part(i, item.kind);
              return {
                key: item.id,
                label: t('exams.talk.chip', { number: i + 1 }),
                done: begun && item.id !== part?.id,
                accessibilityLabel: name,
              };
            })}
          />
          {part && card ? (
            <ExamCard
              heading={`${labels.part(index, part.kind)} · ${labels.minutes(part.seconds)}`}
              card={card}
            />
          ) : (
            <Text variant="small" tone="muted">
              {t('exams.talk.waiting')}
            </Text>
          )}
          <Notes />
        </View>
      }
      failedActions={
        <Button
          label={t('exams.talk.retry')}
          onPress={() => {
            stepFeedback();
            onRetry();
          }}
        />
      }
    />
  );
}

/**
 * 5.17 The simulation (spec §6.13): a call with a neutral examiner who runs the test's parts in
 * order and does not help. When the examiner begins a part, its card shows; the notes from the
 * preparation can be opened. At the end the score is written on the server (5.18).
 */
export function ExamTalkScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { exam } = useLocalSearchParams<{ exam: string }>();
  const [attempt, setAttempt] = useState(0);
  const next = useNextSimulation(exam ?? '');
  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  if (next.phase === 'ready') {
    return <Test key={attempt} next={next.data} onRetry={() => setAttempt((count) => count + 1)} />;
  }
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="close"
            label={t('exams.talk.end')}
            onPress={() => backOr(ROUTES.exams)}
          />
        </View>
      }
    >
      <LoadState
        failed={next.phase === 'failed'}
        loadingLabel={t('exams.loading')}
        slowLabel={t('common.wakingUp')}
        failedLabel={t('exams.loadFailed')}
        retryLabel={t('common.retry')}
        onRetry={() => backOr(ROUTES.exams)}
      />
    </StepLayout>
  );
}
