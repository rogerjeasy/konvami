import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ToggleRow } from '@/components/choice-group';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { useRadioApi, useRadioHub } from '@/radio/services';
import { StudioHero } from './parts';

/**
 * 8.6 Radio settings: the codename (re-rolled, never typed), the Veil default, confirmed reports,
 * and withdrawing the voice-sharing consent, which deletes the learner's calls and takes them out
 * of every show.
 */
export function RadioSettingsScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const api = useRadioApi();
  const { state, refresh, set } = useRadioHub(signedIn);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const hub = state.phase === 'ready' ? state.data : null;
  const profile = hub?.profile ?? null;

  async function leave() {
    setBusy(true);
    try {
      await api.leaveRadio();
      router.replace(ROUTES.radio);
    } finally {
      setBusy(false);
      setLeaving(false);
    }
  }

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
    >
      <Reveal>
        <StudioHero
          title={t('radio.settingsPage.title')}
          body={t('radio.settingsPage.body')}
          live={false}
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
      ) : !profile ? (
        <NoticeBox icon="info">{t('radio.failed.not_joined')}</NoticeBox>
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <Card className="gap-2 p-4">
              <Text variant="labelMedium">
                {t('radio.settingsPage.codename', { codename: profile.codename })}
              </Text>
              <Text variant="small" tone="muted">
                {t('radio.join.codenameHint')}
              </Text>
              <View className="flex-row">
                <TextButton
                  tone="primary"
                  label={t('radio.settingsPage.reroll')}
                  onPress={() => {
                    commitFeedback();
                    void api.rerollRadioCodename().then(set);
                  }}
                />
              </View>
            </Card>
          </Reveal>
          {profile.agreed ? (
            <Reveal delay={staggerDelay(2)}>
              <View className="gap-1.5">
                <ToggleRow
                  label={t('radio.join.veil')}
                  value={profile.veilDefault}
                  onChange={(veilDefault) => void api.changeRadio({ veilDefault }).then(set)}
                />
                <Text variant="small" tone="muted">
                  {t('radio.join.veilHint')}
                </Text>
              </View>
            </Reveal>
          ) : (
            <Reveal delay={staggerDelay(2)}>
              <NoticeBox icon="lock">{t('radio.record.private')}</NoticeBox>
            </Reveal>
          )}
          <Reveal delay={staggerDelay(3)}>
            <Text variant="small" tone="muted">
              {t('radio.settingsPage.strikes', { count: hub.strikes })}
            </Text>
          </Reveal>
          {hub.suspended ? (
            <NoticeBox icon="info" tone="warn">
              {t('radio.settingsPage.suspended')}
            </NoticeBox>
          ) : null}
          <Reveal delay={staggerDelay(4)}>
            <Button
              variant="danger"
              label={t('radio.settingsPage.leave')}
              onPress={() => setLeaving(true)}
            />
          </Reveal>
          <ConfirmSheet
            visible={leaving}
            title={t('radio.settingsPage.leave')}
            body={t('radio.settingsPage.leaveBody')}
            confirmLabel={t('radio.settingsPage.leaveConfirm')}
            cancelLabel={t('radio.settingsPage.keep')}
            danger
            loading={busy}
            onConfirm={() => void leave()}
            onCancel={() => setLeaving(false)}
          />
        </>
      )}
    </StepLayout>
  );
}
