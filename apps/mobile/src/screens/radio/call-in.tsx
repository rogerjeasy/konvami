import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ToggleRow } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { RecordingNow } from '@/components/recording-now';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { radioCallRoute, ROUTES } from '@/lib/routes';
import { usePracticeServices } from '@/practice/services';
import { useRadioApi, useRadioHub } from '@/radio/services';
import { useTheme } from '@/theme';
import {
  RecorderError,
  useSentenceRecorder,
  type SentenceRecording,
} from '@/voice/sentence-recorder';
import { failureKey, SoundBars, StudioHero } from './parts';

// A call is at most 45 seconds; the recorder stops by itself there (ms).
export const MAX_CALL_MS = 45_000;
const MS_PER_SECOND = 1000;

type Step =
  | { kind: 'ready' }
  | { kind: 'recording' }
  | { kind: 'recorded'; recording: SentenceRecording }
  | { kind: 'sending'; recording: SentenceRecording }
  | { kind: 'failed'; code: string; recording?: SentenceRecording };

/**
 * 8.3 Call in: today's question, the Veil for this call, and the recorder. The call can be heard
 * back and recorded again before it is sent; it is written down at once and checked on the server
 * before anyone else hears it.
 */
export function RadioCallInScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const api = useRadioApi();
  const { clips } = usePracticeServices();
  const recorder = useSentenceRecorder();
  const { state, refresh } = useRadioHub(signedIn);
  const hub = state.phase === 'ready' ? state.data : null;
  const [veil, setVeil] = useState<boolean | null>(null);
  const veiled = veil ?? hub?.profile?.veilDefault ?? true;
  const [step, setStep] = useState<Step>({ kind: 'ready' });
  const [listening, setListening] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      clips.stop();
    },
    [clips],
  );

  async function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const recording = await recorder.stop().catch(() => null);
    setStep(recording ? { kind: 'recorded', recording } : { kind: 'failed', code: 'unavailable' });
  }

  async function record() {
    commitFeedback();
    clips.stop();
    setListening(false);
    try {
      await recorder.start();
      setStep({ kind: 'recording' });
      timer.current = setTimeout(() => void stop(), MAX_CALL_MS);
    } catch (error) {
      setStep({
        kind: 'failed',
        code: error instanceof RecorderError ? error.code : 'unavailable',
      });
    }
  }

  function listen(recording: SentenceRecording) {
    commitFeedback();
    if (listening) {
      clips.stop();
      setListening(false);
      return;
    }
    setListening(true);
    clips.play(recording.uri, () => setListening(false), recording.durationMs);
  }

  async function send(recording: SentenceRecording) {
    commitFeedback();
    clips.stop();
    setListening(false);
    setStep({ kind: 'sending', recording });
    try {
      const sent = await api.sendRadioCall({
        audio: recording.base64,
        format: recording.format,
        durationMs: recording.durationMs,
        veiled,
      });
      successFeedback();
      router.replace(radioCallRoute(sent.id));
    } catch (error) {
      setStep({ kind: 'failed', code: apiErrorCode(error), recording });
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  if (hub && hub.available && !hub.profile) return <Redirect href={ROUTES.radioJoin} />;
  const recorded = step.kind === 'recorded' || step.kind === 'sending' ? step.recording : null;
  const kept = step.kind === 'failed' ? step.recording : undefined;
  const onAir = hub?.profile?.agreed ?? false;
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
        !hub?.nextShow ? undefined : step.kind === 'recording' ? (
          <RecordingNow
            label={t('radio.record.recording')}
            hint={t('radio.record.recordingHint')}
            stopLabel={t('radio.record.stop')}
            onStop={() => void stop()}
          />
        ) : recorded || kept ? (
          <View className="gap-2">
            <Button
              variant="tomato"
              label={t('radio.record.send')}
              loading={step.kind === 'sending'}
              disabled={step.kind === 'sending'}
              leading={<Icon name="send" color={color.onTomato} size={size.iconMd} />}
              onPress={() => void send((recorded ?? kept) as SentenceRecording)}
            />
            <TextButton
              tone="primary"
              label={t('radio.record.again')}
              onPress={() => void record()}
            />
          </View>
        ) : (
          <Button
            variant="tomato"
            label={t('radio.record.start')}
            leading={<Icon name="mic" color={color.onTomato} size={size.iconMd} />}
            onPress={() => void record()}
          />
        )
      }
    >
      <Reveal>
        <StudioHero
          title={t('radio.record.title')}
          body={t('radio.record.body')}
          live={step.kind === 'recording'}
          playing={step.kind === 'recording' || listening}
        />
      </Reveal>
      {!hub ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('radio.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('radio.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : !hub.nextShow ? (
        <NoticeBox icon="info">
          {t(failureKey(hub.available ? 'no_language' : 'unavailable'))}
        </NoticeBox>
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <Card className="gap-2 p-4">
              <Text variant="overline" tone="muted">
                {t('radio.record.question')}
              </Text>
              <Text variant="langLarge">{hub.nextShow.question}</Text>
              {hub.nextShow.questionHelp !== hub.nextShow.question ? (
                <Text variant="small" tone="muted">
                  {hub.nextShow.questionHelp}
                </Text>
              ) : null}
            </Card>
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <Text tone="muted">{t('radio.record.tip')}</Text>
          </Reveal>
          {onAir ? (
            <Reveal delay={staggerDelay(3)}>
              <View className="gap-1">
                <ToggleRow label={t('radio.record.veil')} value={veiled} onChange={setVeil} />
                <Text variant="small" tone="muted">
                  {t('radio.record.veilHint')}
                </Text>
              </View>
            </Reveal>
          ) : (
            <Reveal delay={staggerDelay(3)}>
              <NoticeBox icon="lock">{t('radio.record.private')}</NoticeBox>
            </Reveal>
          )}
          {recorded ? (
            <Pop>
              <Button
                variant="secondary"
                label={listening ? t('radio.record.stopListening') : t('radio.record.listen')}
                leading={
                  <Icon name={listening ? 'stop' : 'play'} color={color.fg} size={size.iconMd} />
                }
                onPress={() => listen(recorded)}
              />
              <View className="mt-2 flex-row items-center justify-center gap-2">
                <SoundBars playing={listening} tone={color.primary} />
                <Text variant="small" tone="muted">
                  {t('radio.record.length', {
                    seconds: Math.round(recorded.durationMs / MS_PER_SECOND),
                  })}
                </Text>
              </View>
            </Pop>
          ) : null}
          {step.kind === 'failed' ? (
            <NoticeBox icon="info" tone="warn">
              {t(failureKey(step.code))}
            </NoticeBox>
          ) : null}
        </>
      )}
    </StepLayout>
  );
}
