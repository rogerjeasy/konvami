import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ToggleRow } from '@/components/choice-group';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { useRadioApi, useRadioHub } from '@/radio/services';
import { failureKey, StudioHero } from './parts';

/**
 * 8.7 Join the show: the voice-sharing consent (its own record, `radio_voice` v1) for an adult,
 * and the Veil, on by default. A learner under 18 joins without it: their calls are private
 * practice and never aired.
 */
export function RadioJoinScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const api = useRadioApi();
  const { state, refresh } = useRadioHub(signedIn);
  const [consent, setConsent] = useState(false);
  const [veil, setVeil] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The age band is the server's; until the learner joined it is told by trying (`band` comes
  // back with the profile). The consent is offered to everyone and needed from adults.
  const hub = state.phase === 'ready' ? state.data : null;

  async function join() {
    commitFeedback();
    setBusy(true);
    setFailure(null);
    try {
      await api.joinRadio({ veilDefault: veil, voiceConsent: consent });
      successFeedback();
      router.replace(ROUTES.radioCallIn);
    } catch (error) {
      setFailure(t(failureKey(apiErrorCode(error))));
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
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
        hub?.available ? (
          <Button
            variant="tomato"
            label={t('radio.join.start')}
            loading={busy}
            disabled={busy}
            onPress={() => void join()}
          />
        ) : undefined
      }
    >
      <Reveal>
        <StudioHero title={t('radio.join.title')} body={t('radio.join.body')} live={false} />
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
      ) : !hub.available ? (
        <NoticeBox icon="info">{t('radio.closed')}</NoticeBox>
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <Card className="gap-2 p-4">
              <Text variant="labelMedium">{t('radio.join.codenameHint')}</Text>
            </Card>
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <View className="gap-1.5">
              <ToggleRow label={t('radio.join.consent')} value={consent} onChange={setConsent} />
              <Text variant="small" tone="muted">
                {t('radio.join.consentBody')}
              </Text>
              <Text variant="small" tone="muted">
                {t('radio.join.minor')}
              </Text>
            </View>
          </Reveal>
          <Reveal delay={staggerDelay(3)}>
            <View className="gap-1.5">
              <ToggleRow label={t('radio.join.veil')} value={veil} onChange={setVeil} />
              <Text variant="small" tone="muted">
                {t('radio.join.veilHint')}
              </Text>
            </View>
          </Reveal>
          {failure ? (
            <NoticeBox icon="info" tone="warn">
              {failure}
            </NoticeBox>
          ) : null}
        </>
      )}
    </StepLayout>
  );
}
