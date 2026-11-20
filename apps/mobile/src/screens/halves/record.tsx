import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { RecordingNow } from '@/components/recording-now';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';
import { useHalvesApi, useHalvesCase } from '@/halves/services';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { halvesCaseRoute, ROUTES } from '@/lib/routes';
import { useTheme } from '@/theme';
import { useSpokenAttempt } from '@/voice/use-spoken-attempt';
import { recordFailureKey } from './parts';

// A move is at most 90 seconds; the recorder stops by itself there (ms).
export const MAX_MOVE_MS = 90_000;

/**
 * 7.6 Record a move: the clue of this round in the language the learner speaks, the veil for this
 * move, and the recorder. The move is written down at once and checked on the server before the
 * other player hears it.
 */
export function HalvesRecordScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useHalvesApi();
  const { state, refresh } = useHalvesCase(signedIn ? (id ?? null) : null);
  const found = state.phase === 'ready' ? state.data : null;
  const [veil, setVeil] = useState<boolean | null>(null);
  const veiled = veil ?? found?.veilDefault ?? true;

  const { step, record, stop } = useSpokenAttempt(
    (recording) =>
      api.sendHalvesMove(id ?? '', {
        audio: recording.base64,
        format: recording.format,
        durationMs: recording.durationMs,
        veiled,
      }),
    undefined,
    MAX_MOVE_MS,
  );
  const sent = step.kind === 'heard';
  useEffect(() => {
    if (sent && id) router.replace(halvesCaseRoute(id));
  }, [sent, id]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const round = found?.rounds.find((r) => r.round === found.recordRound);
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(id ? halvesCaseRoute(id) : ROUTES.halves)}
          />
        </View>
      }
      actions={
        round ? (
          step.kind === 'recording' ? (
            <RecordingNow
              label={t('halves.record.recording')}
              hint={t('halves.record.recordingHint')}
              stopLabel={t('halves.record.stop')}
              onStop={() => void stop()}
            />
          ) : step.kind === 'checking' ? (
            <Text tone="muted" accessibilityLiveRegion="polite" className="text-center">
              {t('halves.record.checking')}
            </Text>
          ) : (
            <Button
              label={t('halves.record.start')}
              leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
              onPress={() => void record()}
            />
          )
        ) : undefined
      }
    >
      <Reveal>
        <PageHero
          color="tomato"
          icon="mic"
          title={t('halves.record.title')}
          body={t('halves.record.body')}
        />
      </Reveal>
      {!found ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('halves.case.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('halves.case.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : !round ? (
        <Text tone="muted">{t('halves.record.failed.not_your_turn')}</Text>
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <Card className="gap-2 p-4">
              <Text variant="labelSmall" tone="muted">
                {t('halves.round', { round: round.round })} · {t('halves.case.yourClue')}
              </Text>
              <Text variant="langLarge">{round.clue}</Text>
              <Text variant="small" tone="muted">
                {round.clueHelp}
              </Text>
            </Card>
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <Text tone="muted">{t('halves.record.tip')}</Text>
          </Reveal>
          <Reveal delay={staggerDelay(3)}>
            <Switch label={t('halves.record.veil')} value={veiled} onValueChange={setVeil} />
          </Reveal>
          {step.kind === 'failed' ? (
            <NoticeBox icon="info" tone="warn">
              {t(recordFailureKey(step.code))}
            </NoticeBox>
          ) : null}
        </>
      )}
    </StepLayout>
  );
}
