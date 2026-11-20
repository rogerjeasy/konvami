import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ChainReportReason } from '@konvami/api-client';
import { size } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ToggleRow } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { RecordingNow } from '@/components/recording-now';
import { ReportSheet } from '@/components/report-sheet';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useChainApi, useChainStory } from '@/chain/services';
import { useLineRecorder } from '@/chain/use-line-recorder';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { chainStoryRoute, ROUTES } from '@/lib/routes';
import { useTheme } from '@/theme';
import { HeardLine, ListenButton, turnFailureKey } from './parts';

// The social reasons of a report, the same in every game (7.10, 8.x, 9.10).
const REPORT_REASONS: ChainReportReason[] = [
  'harassment',
  'sexual',
  'personal',
  'hate',
  'off_topic',
  'other',
];

/**
 * 9.4 Your turn: the line before (heard first, its words behind a tap) and the narrator's summary
 * of the story so far, then the learner's own line: recorded, listened back, recorded again if
 * they like, and sent. The server writes it down and checks it before anyone hears it.
 */
export function ChainTurnScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useChainApi();
  const { state, refresh, set } = useChainStory(signedIn ? (id ?? null) : null);
  const story = state.phase === 'ready' ? state.data : null;
  const [veil, setVeil] = useState<boolean | null>(null);
  const [reporting, setReporting] = useState(false);
  const veiled = veil ?? story?.veilDefault ?? true;

  const { step, record, stop, submit, reset } = useLineRecorder((recording) =>
    api.sendChainLine(id ?? '', {
      audio: recording.base64,
      format: recording.format,
      durationMs: recording.durationMs,
      veiled,
    }),
  );
  useEffect(() => {
    if (step.kind === 'sent' && id) router.replace(chainStoryRoute(id));
  }, [step.kind, id]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const before = story?.before ?? null;
  const kept =
    step.kind === 'recorded' || step.kind === 'sending'
      ? step.recording
      : step.kind === 'failed'
        ? (step.recording ?? null)
        : null;

  async function report(reason: ChainReportReason, note: string, block: boolean) {
    if (!before?.id || !id || !story) return;
    let changed = await api.reportChainLine(before.id, { reason, note: note || null });
    // The line before the learner's was said by the seat before theirs, round the table.
    const count = story.seats.length;
    const theirs = ((story.mySeat - 2 + count) % count) + 1;
    if (block && !before.ai) changed = await api.blockChainPlayer(id, theirs);
    set(changed);
    setReporting(false);
  }

  const actions = !story?.myTurn ? undefined : step.kind === 'recording' ? (
    <RecordingNow
      label={t('chain.turn.recording')}
      hint={t('chain.turn.recordingHint')}
      stopLabel={t('chain.turn.stopRecording')}
      onStop={() => void stop()}
    />
  ) : kept ? (
    <View className="gap-2">
      <Button
        label={step.kind === 'sending' ? t('chain.turn.sending') : t('chain.turn.send')}
        loading={step.kind === 'sending'}
        leading={<Icon name="send" color={color.onPrimary} size={size.iconMd} />}
        onPress={() => void submit()}
      />
      <TextButton
        tone="primary"
        label={t('chain.turn.again')}
        onPress={() => {
          reset();
          void record();
        }}
      />
    </View>
  ) : (
    <Button
      label={t('chain.turn.record')}
      leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
      onPress={() => void record()}
    />
  );

  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center justify-between">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(id ? chainStoryRoute(id) : ROUTES.chain)}
          />
          {before?.kind === 'line' && !before.hidden ? (
            <TextButton label={t('chain.story.report')} onPress={() => setReporting(true)} />
          ) : null}
        </View>
      }
      actions={actions}
    >
      <Reveal>
        <PageHero
          color="pink"
          icon="mic"
          title={t('chain.turn.title')}
          body={t('chain.turn.body')}
        />
      </Reveal>
      {!story ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('chain.story.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('chain.story.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : !story.myTurn || !before ? (
        <Text tone="muted">{t('chain.turn.failed.not_your_turn')}</Text>
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <Card className="gap-3 p-4">
              <Text variant="labelSmall" tone="muted">
                {before.kind === 'narrator' ? t('chain.turn.opening') : t('chain.turn.before')}
                {' · '}
                {t('chain.lineOf', { position: story.position, lines: story.lines })}
              </Text>
              {before.hasAudio ? (
                <ListenButton
                  label={t('chain.turn.play')}
                  address={() =>
                    before.kind === 'narrator' || !before.id
                      ? api.getChainOpeningAudio(story.id)
                      : api.getChainLineAudio(before.id)
                  }
                />
              ) : null}
              <HeardLine heard={before} reveal={before.hasAudio} />
            </Card>
          </Reveal>
          {before.recap ? (
            <Reveal delay={staggerDelay(2)}>
              <View className="gap-1 rounded-card bg-pink p-4">
                <Text variant="labelSmall" tone="onPink">
                  {t('chain.turn.recap')}
                </Text>
                <Text variant="langBody" tone="onPink">
                  {before.recap}
                </Text>
              </View>
            </Reveal>
          ) : null}
          <Reveal delay={staggerDelay(3)}>
            <Text tone="muted">{t('chain.turn.tip')}</Text>
          </Reveal>
          {kept ? (
            <Reveal>
              <ListenButton label={t('chain.turn.listenBack')} local={kept.uri} />
            </Reveal>
          ) : null}
          <Reveal delay={staggerDelay(4)}>
            <ToggleRow label={t('chain.turn.veil')} value={veiled} onChange={setVeil} />
          </Reveal>
          {step.kind === 'failed' ? (
            <NoticeBox icon="info" tone="warn">
              {t(turnFailureKey(step.code))}
            </NoticeBox>
          ) : null}
          <ReportSheet
            visible={reporting}
            title={t('chain.report.title')}
            body={t('halves.report.body')}
            reasons={REPORT_REASONS}
            // The game's own words for off the topic; the other reasons are Two Halves'.
            reasonLabel={(one) =>
              one === 'off_topic' ? t('chain.report.offTopic') : t(`halves.report.reason.${one}`)
            }
            noteLabel={t('halves.report.note')}
            sendLabel={t('halves.report.send')}
            // Only a learner can be blocked; an AI character's line is reported, never blocked.
            blockLabel={before.ai ? undefined : t('halves.report.block')}
            onSend={report}
            onClose={() => setReporting(false)}
          />
        </>
      )}
    </StepLayout>
  );
}
