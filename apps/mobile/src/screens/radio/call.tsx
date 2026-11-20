import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChatBubble } from '@/components/chat';
import { CorrectionCard } from '@/components/correction-card';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { radioEpisodeRoute, ROUTES } from '@/lib/routes';
import { diffWords } from '@/lib/word-diff';
import { usePracticeServices } from '@/practice/services';
import { useRadioApi, useRadioCall } from '@/radio/services';
import { SayItBetterSheet } from '@/screens/report/say-it-better';
import { CallStatus } from './parts';

/**
 * 8.4 One of the learner's calls, privately: what they said, the corrections the second check
 * confirmed (amber, never red), "Say it better" and cards. Listeners never see any of it; the
 * host never corrects on air.
 */
export function RadioCallScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useRadioApi();
  const { clips } = usePracticeServices();
  const { state, refresh } = useRadioCall(signedIn ? (id ?? null) : null);
  const [practising, setPractising] = useState<number | null>(null);
  const [right, setRight] = useState<ReadonlySet<number>>(new Set());
  const [kept, setKept] = useState<ReadonlySet<number>>(new Set());
  const [playing, setPlaying] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);

  useEffect(() => () => clips.stop(), [clips]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const call = state.phase === 'ready' ? state.data : null;

  async function play() {
    if (!call) return;
    commitFeedback();
    if (playing) {
      clips.stop();
      setPlaying(false);
      return;
    }
    const { url } = await api.getRadioCallAudio(call.id);
    setPlaying(true);
    clips.play(url, () => setPlaying(false));
  }

  async function keep(index: number) {
    if (!call) return;
    commitFeedback();
    await api.saveRadioCorrectionCard(call.id, index);
    successFeedback();
    setKept((now) => new Set(now).add(index));
  }

  async function withdraw() {
    if (!call) return;
    await api.withdrawRadioCall(call.id);
    setWithdrawn(true);
    refresh();
  }

  const held = call && (call.status === 'held' || call.status === 'failed');
  const practised = practising !== null ? call?.corrections[practising] : undefined;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.radio)}
          />
        </View>
      }
      actions={
        call?.status === 'aired' ? (
          <Button
            variant="tomato"
            label={t('radio.mine.listen')}
            onPress={() => router.push(radioEpisodeRoute(call.episodeId))}
          />
        ) : undefined
      }
    >
      <Reveal>
        <PageHero
          color="tomato"
          icon="lock"
          title={t('radio.mine.title')}
          body={t('radio.mine.body')}
        />
      </Reveal>
      {!call ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('radio.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('radio.failed.not_found')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : (
        <>
          {call.status === 'aired' ? (
            <Pop>
              <NoticeBox icon="radio" tone="primary">
                {t('radio.aired.title')}
              </NoticeBox>
            </Pop>
          ) : null}
          <Reveal delay={staggerDelay(1)}>
            <Card className="gap-2.5 p-4">
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <Text variant="overline" tone="muted">
                  {t('radio.mine.question')}
                </Text>
                <CallStatus call={call} />
              </View>
              <Text variant="langBody" tone="muted">
                {call.question}
              </Text>
              {call.transcript ? (
                <>
                  <Text variant="overline" tone="muted">
                    {t('radio.mine.said')}
                  </Text>
                  {/* The learner's own words: a lime bubble, in the serif italic. */}
                  <ChatBubble from="learner" lang>
                    {call.transcript}
                  </ChatBubble>
                </>
              ) : null}
              {call.playable ? (
                <View className="flex-row">
                  <TextButton
                    tone="primary"
                    label={playing ? t('radio.mine.stop') : t('radio.mine.play')}
                    onPress={() => void play()}
                  />
                </View>
              ) : null}
            </Card>
          </Reveal>
          {held ? (
            <Reveal delay={staggerDelay(2)}>
              <View className="gap-2">
                <NoticeBox icon="info" tone="warn" title={t('radio.mine.held')}>
                  {call.reasons
                    .map((reason) =>
                      t(`radio.mine.reasons.${reason}` as 'radio.mine.reasons.unavailable', {
                        defaultValue: t('radio.mine.reasons.unavailable'),
                      }),
                    )
                    .join(' ')}
                </NoticeBox>
                {call.reasons.includes('self_harm') ? (
                  <NoticeBox icon="info">{t('radio.mine.care')}</NoticeBox>
                ) : null}
              </View>
            </Reveal>
          ) : null}
          {call.status === 'checking' ? (
            <Text tone="muted" accessibilityLiveRegion="polite">
              {t('radio.record.sent')}
            </Text>
          ) : null}
          {!held && call.status !== 'removed' ? (
            <Reveal delay={staggerDelay(3)}>
              <View className="gap-2.5">
                <Text variant="section" accessibilityRole="header">
                  {t('radio.mine.corrections')}
                </Text>
                {call.status === 'checking' ? (
                  <Text tone="muted">{t('radio.mine.pending')}</Text>
                ) : call.corrections.length === 0 ? (
                  <Text tone="muted">{t('radio.mine.none')}</Text>
                ) : (
                  call.corrections.map((correction, index) => {
                    const diff = diffWords(correction.original, correction.corrected);
                    return (
                      <CorrectionCard
                        key={correction.original}
                        badge={correction.certain ? undefined : t('radio.mine.unsure')}
                        saidLabel={t('radio.mine.said')}
                        said={diff.before}
                        betterLabel={t('radio.mine.corrections')}
                        better={diff.after}
                        explanation={correction.explanation}
                        accessibilityLabel={`${correction.original} → ${correction.corrected}. ${correction.explanation}`}
                        action={
                          correction.certain ? (
                            <View className="flex-row flex-wrap gap-x-3">
                              <TextButton
                                tone="primary"
                                label={
                                  right.has(index)
                                    ? `✓ ${t('radio.mine.right')}`
                                    : t('radio.mine.sayBetter')
                                }
                                onPress={() => setPractising(index)}
                              />
                              <TextButton
                                tone="primary"
                                label={
                                  kept.has(index) ? t('radio.mine.kept') : t('radio.mine.keep')
                                }
                                disabled={kept.has(index)}
                                onPress={() => void keep(index)}
                              />
                            </View>
                          ) : undefined
                        }
                      />
                    );
                  })
                )}
              </View>
            </Reveal>
          ) : null}
          {withdrawn || call.status === 'removed' ? (
            <NoticeBox icon="check">{t('radio.mine.withdrawn')}</NoticeBox>
          ) : (
            <Reveal delay={staggerDelay(4)}>
              <View className="flex-row">
                <TextButton label={t('radio.mine.withdraw')} onPress={() => void withdraw()} />
              </View>
            </Reveal>
          )}
          <SayItBetterSheet
            index={practising}
            said={practised?.original ?? ''}
            sentence={practised?.corrected ?? ''}
            before={null}
            check={(index, recording) =>
              api.sayRadioCorrectionBetter(call.id, index, {
                audio: recording.base64,
                format: recording.format,
                durationMs: recording.durationMs,
              })
            }
            onClose={() => setPractising(null)}
            onRight={(index) => setRight((now) => new Set(now).add(index))}
          />
        </>
      )}
    </StepLayout>
  );
}
