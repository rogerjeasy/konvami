import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Persona } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CallStage } from '@/components/call-stage';
import type { IconName } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { NoticeBox } from '@/components/notice-box';
import { Sheet } from '@/components/sheet';
import { StepLayout } from '@/components/step-layout';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useCountdown } from '@/hooks/use-countdown';
import { formatDuration } from '@/lib/format';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { backOr } from '@/lib/navigation';
import { conversationDoneRoute, ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices, useScenarios } from '@/practice/services';
import { useMinutesBack } from '@/profile/services';
import { Goals } from './goals';
import { setPartnerCaptions, usePreferences } from '@/preferences';
import { HELP_KINDS, type HelpKind } from '@/voice/help';
import { withLine } from '@/voice/problems';
import { useVoiceCall, type CallProblem } from '@/voice/use-voice-call';

/** Failures with their own explanation; anything else reads as the general message. */
const PROBLEM_KEY = {
  mic_denied: 'conversation.problems.mic_denied',
  no_microphone: 'conversation.problems.no_microphone',
  unsupported: 'conversation.problems.unsupported',
  consent_required: 'conversation.problems.consent_required',
  minutes_used_up: 'conversation.problems.minutes_used_up',
  voice_paused: 'conversation.problems.voice_paused',
  voice_unavailable: 'conversation.problems.voice_unavailable',
  network: 'errors.network',
} as const satisfies Partial<Record<CallProblem, string>>;

const problemKey = (problem: CallProblem) =>
  problem in PROBLEM_KEY ? PROBLEM_KEY[problem as keyof typeof PROBLEM_KEY] : 'errors.unknown';

/** Failures that another try right away cannot get past: the way back leads, not "Try again". */
const FINAL: readonly CallProblem[] = [
  'minutes_used_up',
  'voice_paused',
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

// The help sheet's rows, in order, with their icons.
const HELP_ICONS: Record<HelpKind, IconName> = {
  stuck: 'compass',
  slower: 'clock',
  repeat: 'refresh',
  translate: 'globe',
  explain: 'info',
};

/**
 * What the learner can ask for during a conversation (spec §6.4 help buttons), and whether the
 * partner's words are shown. Asking closes the sheet; the partner answers right away.
 */
function HelpSheet({
  visible,
  name,
  onHelp,
  onClose,
}: {
  visible: boolean;
  name: string;
  onHelp: (kind: HelpKind) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { partnerCaptions } = usePreferences();
  return (
    <Sheet visible={visible} title={t('conversation.help.title')} onClose={onClose}>
      <View className="gap-4 pt-1">
        <ListGroup>
          {HELP_KINDS.map((kind) => (
            <ListRow
              key={kind}
              icon={HELP_ICONS[kind]}
              title={t(`conversation.help.${kind}`)}
              detail={t(`conversation.help.${kind}Hint`, { name })}
              onPress={() => onHelp(kind)}
            />
          ))}
        </ListGroup>
        <Card className="flex-row items-center gap-3 p-3.5">
          <View className="flex-1 gap-1">
            <Text variant="labelMedium">{t('conversation.help.captions', { name })}</Text>
            <Text variant="small" tone="muted">
              {t('conversation.help.captionsHint')}
            </Text>
          </View>
          <Switch
            label={t('conversation.help.captions', { name })}
            value={partnerCaptions}
            onValueChange={(shown) => void setPartnerCaptions(shown)}
          />
        </Card>
      </View>
    </Sheet>
  );
}

/** One live call with a partner. Mounted anew for every attempt (see `LiveConversationScreen`). */
function Call({
  partner,
  scenario,
  onRetry,
}: {
  partner: Persona;
  /** The role-play, for one; its goals show once the catalog is read. */
  scenario?: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const call = useVoiceCall('practice', partner.id, scenario);
  const { scenarios } = useScenarios();
  const rolePlay = scenario ? scenarios?.find(({ id }) => id === scenario) : undefined;
  const { conversation, callId, stop } = call;
  const { partnerCaptions } = usePreferences();
  const [helping, setHelping] = useState(false);
  const canHelp = call.status === 'live' && !conversation.finished;
  const minutesBack = useMinutesBack(call.problem === 'minutes_used_up');

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
      problem={call.problem && !lost ? withLine(t(problemKey(call.problem)), minutesBack) : null}
      progress={
        rolePlay ? <Goals scenario={rolePlay} reached={conversation.tasksDone} /> : undefined
      }
      hiddenPersonaText={
        partnerCaptions ? null : t('conversation.help.hidden', { name: partner.name })
      }
      header={
        <View className="min-h-tap flex-row items-center justify-end pb-2">
          {call.status === 'live' && call.maxSeconds ? (
            <TimeLeft seconds={call.maxSeconds} />
          ) : null}
        </View>
      }
      mainAction={
        <>
          <Button
            variant="secondary"
            label={t('conversation.end')}
            onPress={() => {
              commitFeedback();
              leave();
            }}
          />
          {/* A modal: where it sits in the tree does not change where it shows. */}
          <HelpSheet
            visible={helping && canHelp}
            name={partner.name}
            onClose={() => setHelping(false)}
            onHelp={(kind) => {
              commitFeedback();
              setHelping(false);
              call.help(kind);
            }}
          />
        </>
      }
      sideAction={
        <TextButton
          tone="primary"
          disabled={!canHelp}
          label={t('conversation.help.open')}
          onPress={() => setHelping(true)}
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
 * The partner speaks first; the screen shows who is speaking, the latest line of each side (the
 * partner's can be hidden, to practise listening) and how much time is left. Help (stuck,
 * slower, repeat, translate, explain) is a tap away. It ends when the learner ends it, when the partner has said goodbye,
 * or when the time is up, and then shows what it added up to.
 */
export function LiveConversationScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { personaId, scenario } = useLocalSearchParams<{
    personaId: string;
    scenario?: string;
  }>();
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
  return (
    <Call
      key={attempt}
      partner={partner}
      scenario={scenario}
      onRetry={() => setAttempt((count) => count + 1)}
    />
  );
}
