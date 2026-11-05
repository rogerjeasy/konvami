import { useMemo } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Transcript, TurnAudio } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { ChatBubble } from '@/components/chat';
import { EmptyState } from '@/components/empty-state';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { PlayButton } from '@/components/play-button';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { Card } from '@/components/card';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { formatShortDate, wholeMinutes } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { conversationRoute, ROUTES } from '@/lib/routes';
import { usePracticeServices, useThenVsNow } from '@/practice/services';
import { usePlayback } from '@/practice/use-playback';

// How many of the learner's recorded lines each side plays. The start of a conversation is where
// the two sound most alike (a greeting, who they are), and a handful is enough to hear a
// difference without a ten-minute listen.
const EXCERPT_LINES = 4;

type Side = 'then' | 'now';

interface Line {
  text: string;
  audio: TurnAudio;
  group: Side;
}

/** The learner's own recorded lines of one conversation, as they said them. */
function linesOf(transcript: Transcript, group: Side): Line[] {
  const lines: Line[] = [];
  for (const turn of transcript.turns) {
    if (turn.speaker !== 'learner' || !turn.audio) continue;
    lines.push({ text: turn.verbatim ?? turn.text, audio: turn.audio, group });
    if (lines.length === EXCERPT_LINES) break;
  }
  return lines;
}

function Moment({
  side,
  transcript,
  lines,
  playing,
  onToggle,
  firstIndex,
  now,
}: {
  side: Side;
  transcript: Transcript;
  lines: Line[];
  playing: number | null;
  onToggle: (index: number) => void;
  /** Where this side's lines start in the one list that is played. */
  firstIndex: number;
  now: Date;
}) {
  const { t, i18n } = useTranslation();
  const { conversation } = transcript;
  const when = t(side === 'then' ? 'thenVsNow.thenWhen' : 'thenVsNow.nowWhen');
  const date = formatShortDate(i18n.language, conversation.startedAt, now);
  const meta = conversation.partner
    ? t('thenVsNow.meta', { date, name: conversation.partner.name })
    : t('thenVsNow.metaNoPartner', { date });
  return (
    <Card className="gap-4 p-4">
      <View className="gap-1">
        <Text variant="heading" accessibilityRole="header">
          {t(side === 'then' ? 'thenVsNow.then' : 'thenVsNow.now')}
        </Text>
        <Text variant="small" tone="subtle">
          {conversation.endedAt
            ? `${meta} · ${t('time.minutes', { count: wholeMinutes(conversation.seconds) })}`
            : meta}
        </Text>
      </View>
      <View className="gap-2.5">
        {lines.map((line, i) => {
          const index = firstIndex + i;
          return (
            <View key={i} className="w-full flex-row-reverse items-center gap-2">
              <View className="shrink">
                <ChatBubble
                  from="learner"
                  accessibilityLabel={t('thenVsNow.line', { when, text: line.text })}
                >
                  {line.text}
                </ChatBubble>
              </View>
              <PlayButton
                label={
                  playing === index ? t('thenVsNow.stopPlaying') : t('thenVsNow.play', { when })
                }
                state={playing === index ? 'playing' : 'idle'}
                onPress={() => onToggle(index)}
              />
            </View>
          );
        })}
      </View>
      <TextButton
        label={t('thenVsNow.whole')}
        onPress={() => router.push(conversationRoute(conversation.id))}
      />
    </Card>
  );
}

function Pair({
  then,
  now,
  weeksApart,
}: {
  then: Transcript;
  now: Transcript;
  weeksApart: number;
}) {
  const { t } = useTranslation();
  const { split } = useScreenLayout();
  const { clock } = usePracticeServices();
  const thenLines = useMemo(() => linesOf(then, 'then'), [then]);
  const nowLines = useMemo(() => linesOf(now, 'now'), [now]);
  // One list, so one clip plays at a time; `group` keeps playing from running into the other side.
  const all = useMemo(() => [...thenLines, ...nowLines], [thenLines, nowLines]);
  const { playing, toggle } = usePlayback(all);
  const today = new Date(clock.now());
  return (
    <>
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {t('thenVsNow.title')}
          </Text>
          <Text tone="muted">{t('thenVsNow.intro')}</Text>
          <Text variant="captionStrong" tone="primary">
            {t('thenVsNow.weeksApart', { count: weeksApart })}
          </Text>
        </View>
      </Reveal>
      <View className={split ? 'flex-row items-start gap-4' : 'gap-4'}>
        <View className={split ? 'flex-1' : undefined}>
          <Reveal delay={staggerDelay(1)}>
            <Moment
              side="then"
              transcript={then}
              lines={thenLines}
              playing={playing}
              onToggle={toggle}
              firstIndex={0}
              now={today}
            />
          </Reveal>
        </View>
        <View className={split ? 'flex-1' : undefined}>
          <Reveal delay={staggerDelay(2)}>
            <Moment
              side="now"
              transcript={now}
              lines={nowLines}
              playing={playing}
              onToggle={toggle}
              firstIndex={thenLines.length}
              now={today}
            />
          </Reveal>
        </View>
      </View>
    </>
  );
}

/**
 * 5.20 Then vs Now (spec §7, §6.15): the learner's voice from their first weeks next to a recent
 * conversation of the same kind. Nothing is scored: two recordings weeks apart say more than a
 * number that would have to be made up. Without recordings it says why and what to do.
 */
export function ThenVsNowScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const reading = useThenVsNow();

  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  const header = (
    <View className="min-h-tap flex-row items-center">
      <HeaderButton
        icon="chevronLeft"
        label={t('common.back')}
        onPress={() => backOr(ROUTES.progress)}
      />
    </View>
  );
  if (reading.phase !== 'ready') {
    return (
      <StepLayout header={header}>
        <LoadState
          failed={reading.phase === 'failed'}
          loadingLabel={t('thenVsNow.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            reading.phase === 'failed' && reading.code === 'network'
              ? 'errors.network'
              : 'thenVsNow.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={reading.retry}
        />
      </StepLayout>
    );
  }
  if (reading.pair === 'ready') {
    return (
      <StepLayout header={header}>
        <Pair then={reading.then} now={reading.now} weeksApart={reading.weeksApart} />
      </StepLayout>
    );
  }
  // Recordings off sends the learner to the switch; the other two to a conversation.
  const off = reading.pair === 'off';
  const key = off ? 'off' : reading.pair === 'none' ? 'none' : 'notYet';
  return (
    <StepLayout header={header}>
      <EmptyState
        icon="mic"
        title={t(`thenVsNow.${key}.title`)}
        body={t(`thenVsNow.${key}.body`)}
        action={
          <Button
            label={t(`thenVsNow.${key}.action`)}
            onPress={() => router.navigate(off ? ROUTES.accountPrivacy : ROUTES.talk)}
          />
        }
      />
    </StepLayout>
  );
}
