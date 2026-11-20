import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Persona } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CallStage } from '@/components/call-stage';
import { Icon, type IconName } from '@/components/icon';
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
import { useRolePlays } from '@/hooks/use-role-plays';
import { useHome, usePracticeServices } from '@/practice/services';
import { usePaywall, usePurchaseDevice } from '@/plan/services';
import { useMinutesBack, usePlan } from '@/profile/services';
import { CaptionLookupSheet, type CaptionSelection } from './caption-lookup';
import { Goals } from './goals';
import { CorrectionSheet, LiveCorrections } from './live-corrections';
import { CallPlanStrip } from './plan';
import { BlockScope } from '@/components/block-scope';
import { CallNotice } from './forget-toast';
import { setLiveCorrections, setPartnerCaptions, usePreferences } from '@/preferences';
import { HELP_KINDS, type HelpKind } from '@/voice/help';
import { withLine } from '@/voice/problems';
import type { LiveCorrection } from '@/voice/conversation';
import { useWalkingCall } from '@/voice/use-walking-call';
import { useVoiceCall, type CallProblem } from '@/voice/use-voice-call';
import { useVideoAvatar } from '@/voice/video-avatar';
import { useTheme } from '@/theme';

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
    // A pill on the forest ground, as the prototype's timer.
    <View className="min-h-tap justify-center rounded-pill bg-veil-light px-3.5">
      <Text variant="labelSmall" tone="onForest" style={{ fontVariant: ['tabular-nums'] }}>
        {t('conversation.timeLeft', { time: formatDuration(secondsLeft) })}
      </Text>
    </View>
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
  manual,
  onManual,
  walking,
  name,
  onHelp,
  onClose,
}: {
  visible: boolean;
  manual: boolean;
  onManual: (enabled: boolean) => void;
  walking: ReturnType<typeof useWalkingCall>;
  name: string;
  onHelp: (kind: HelpKind) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { partnerCaptions, liveCorrections } = usePreferences();
  return (
    <Sheet visible={visible} title={t('conversation.help.title')} icon="info" onClose={onClose}>
      <View className="gap-4 pt-1">
        {walking.available ? (
          <View className="gap-2">
            <Text>{t('call.walkingHint')}</Text>
            <Switch
              label={t('call.walking')}
              value={walking.enabled}
              locked={walking.busy}
              onValueChange={(enabled) => void walking.set(enabled)}
            />
            {walking.failed ? <NoticeBox icon="info">{t('call.walkingFailed')}</NoticeBox> : null}
          </View>
        ) : null}
        <View className="flex-row items-center justify-between gap-3">
          <Text className="shrink">{t('call.pushToTalk')}</Text>
          <Switch label={t('call.pushToTalk')} value={manual} onValueChange={onManual} />
        </View>
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
        <Card className="flex-row items-center gap-3 p-3.5">
          <View className="flex-1 gap-1">
            <Text variant="labelMedium">{t('conversation.help.corrections')}</Text>
            <Text variant="small" tone="muted">
              {t('conversation.help.correctionsHint')}
            </Text>
          </View>
          <Switch
            label={t('conversation.help.corrections')}
            value={liveCorrections}
            onValueChange={(shown) => void setLiveCorrections(shown)}
          />
        </Card>
      </View>
    </Sheet>
  );
}

/** One live call with a partner. Mounted anew for every attempt (see `LiveConversationScreen`). */
function Call({
  language,
  partner,
  guest,
  scenario,
  practise,
  rang = false,
  walkOnStart = false,
  onRetry,
}: {
  language: string;
  partner: Persona;
  /** A second partner who joins the conversation (5.24); `partner` leads. */
  guest?: Persona;
  /** The role-play, for one; its goals show once the catalog is read. */
  scenario?: string;
  /** A grammar topic the learner chose to practise (the grammar map's "Practise this"). */
  practise?: string;
  /** A short call the learner accepted from the partner's ring (5.28). */
  rang?: boolean;
  /** Turns walking mode on as soon as the call is live (a hands-free drill, 5.30). */
  walkOnStart?: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { lookupCaption, saveCaptionWord } = usePracticeServices();
  const [selectedWord, setSelectedWord] = useState<CaptionSelection | null>(null);
  const call = useVoiceCall(
    'practice',
    partner.id,
    scenario,
    practise,
    guest ? { guestId: guest.id } : rang ? { rang } : undefined,
  );
  // A vendor's video face while the call is live, where one is offered and picked (6.6).
  const video = useVideoAvatar(partner.id, call.status === 'live');
  const rolePlays = useRolePlays();
  const rolePlay = scenario ? rolePlays.find(scenario) : undefined;
  const { conversation, callId, stop, plan } = call;
  const { partnerCaptions, liveCorrections } = usePreferences();
  const [helping, setHelping] = useState(false);
  const [explaining, setExplaining] = useState<LiveCorrection | null>(null);
  const canHelp = call.status === 'live' && !call.reconnecting && !conversation.finished;
  const minutesBack = useMinutesBack(call.problem === 'minutes_used_up');
  const paywall = usePaywall();
  const device = usePurchaseDevice();
  const planState = usePlan();
  const canUpgrade = device.available && planState.phase === 'ready' && planState.data.enforced;

  /** Ends the call and shows what it added up to; a call that never connected just closes. */
  const leave = useCallback(() => {
    stop();
    if (callId) router.replace(conversationDoneRoute(callId));
    else backOr(ROUTES.today);
  }, [stop, callId]);

  const walking = useWalkingCall(call, leave);
  // A hands-free drill (5.30) starts in walking mode, once, where the device offers it; the
  // learner can still turn it off in the help sheet.
  const walkedOnStart = useRef(false);
  const live = call.status === 'live';
  useEffect(() => {
    if (!walkOnStart || walkedOnStart.current || !live || !walking.available) return;
    walkedOnStart.current = true;
    void walking.set(true);
  }, [walkOnStart, live, walking]);

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
    <BlockScope block="forest">
      <CallStage
        call={call}
        persona={partner}
        video={video}
        guest={guest}
        onLookupWord={(word, caption) => setSelectedWord({ language, word, caption })}
        hint={
          guest
            ? t('together.callHint', { first: partner.name, second: guest.name })
            : t('conversation.hint', { name: partner.name })
        }
        finishedLabel={t('conversation.finished')}
        problem={call.problem && !lost ? withLine(t(problemKey(call.problem)), minutesBack) : null}
        progress={
          <>
            {rolePlay ? <Goals goals={rolePlay.goals} reached={conversation.tasksDone} /> : null}
            {plan ? <CallPlanStrip plan={plan} learnerLines={conversation.learnerLines} /> : null}
          </>
        }
        notice={<CallNotice conversation={conversation} />}
        belowLearner={
          liveCorrections ? (
            <LiveCorrections corrections={conversation.corrections} onOpen={setExplaining} />
          ) : null
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
            {call.pushToTalk ? (
              <Button
                variant="lime"
                label={t(call.muted ? 'call.holdToTalk' : 'call.releaseToSend')}
                disabled={!canHelp}
                onPressIn={call.beginTurn}
                onPressOut={call.endTurn}
              />
            ) : null}
            {/* Ending is the tomato pill: the one control that stops the talking. */}
            <Button
              variant="tomato"
              leading={<Icon name="stop" color={color.onTomato} size={size.iconMd} />}
              label={t('conversation.end')}
              onPress={() => {
                commitFeedback();
                leave();
              }}
            />
            {/* Modals: where they sit in the tree does not change where they show. */}
            <CaptionLookupSheet
              selection={selectedWord}
              onClose={() => setSelectedWord(null)}
              lookup={lookupCaption}
              save={saveCaptionWord}
              labels={{
                loading: t('captionLookup.loading'),
                failed: t('captionLookup.failed'),
                save: t('captionLookup.save'),
                saved: t('captionLookup.saved'),
                uncertain: t('captionLookup.uncertain'),
                saveFailed: t('captionLookup.saveFailed'),
                plural: t('captionLookup.plural'),
              }}
            />
            <CorrectionSheet correction={explaining} onClose={() => setExplaining(null)} />
            <HelpSheet
              walking={walking}
              manual={call.pushToTalk}
              onManual={(enabled) => {
                if (enabled) void walking.set(false);
                call.setPushToTalk(enabled);
              }}
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
            <>
              {call.problem === 'minutes_used_up' && canUpgrade ? (
                <Button label={t('plan.see')} onPress={() => paywall.open('minutes')} />
              ) : null}
              <Button
                variant={call.problem === 'minutes_used_up' && canUpgrade ? 'secondary' : 'primary'}
                label={t('conversation.back')}
                onPress={toToday}
              />
            </>
          ) : (
            <>
              <Button label={t('conversation.retry')} onPress={onRetry} />
              <TextButton tone="primary" label={t('conversation.back')} onPress={toToday} />
            </>
          )
        }
      />
    </BlockScope>
  );
}

/**
 * 5.3 Conversation: a live practice conversation with one of the learner's partners (spec §6.4).
 * The partner speaks first; the screen shows who is speaking, the latest line of each side (the
 * partner's can be hidden, to practise listening) and how much time is left. Help (stuck,
 * slower, repeat, translate, explain) is a tap away. What the conversation practises shows under
 * the lines (the plan), and mistakes found in what the learner said show under their line. It ends when the learner ends it, when the partner has said goodbye,
 * or when the time is up, and then shows what it added up to.
 */
export function LiveConversationScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { personaId, scenario, practise, guest, rang, walking } = useLocalSearchParams<{
    personaId: string;
    scenario?: string;
    practise?: string;
    guest?: string;
    /** "1" for a call the learner accepted from the partner's ring (5.28). */
    rang?: string;
    walking?: string;
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
  const second = guest
    ? home.data.partners.find(({ persona }) => persona.id === guest)?.persona
    : undefined;
  // A second partner asked for but no longer there is not quietly dropped.
  if (!partner || (guest && !second) || second?.id === partner.id) {
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
      language={home.data.language}
      partner={partner}
      guest={second}
      scenario={scenario}
      practise={practise}
      rang={rang === '1'}
      walkOnStart={walking === '1'}
      onRetry={() => setAttempt((count) => count + 1)}
    />
  );
}
