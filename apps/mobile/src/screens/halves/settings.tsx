import { ToggleRow } from '@/components/choice-group';
import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Halves } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useHalvesApi, useHalvesHub } from '@/halves/services';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { PlacePicker } from './join';

/**
 * 7.11 Two Halves settings: the codename, pause, the veil, the place, blocked players and duos,
 * and leaving with all of one's Two Halves data (which withdraws the voice-sharing consent).
 */
export function HalvesSettingsScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const api = useHalvesApi();
  const { state, refresh, set } = useHalvesHub(signedIn);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);

  async function change(request: () => Promise<Halves>) {
    commitFeedback();
    set(await request());
  }

  async function leave() {
    setBusy(true);
    try {
      await api.leaveHalves();
      setLeaving(false);
      router.replace(ROUTES.halves);
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const hub = state.phase === 'ready' ? state.data : null;
  const profile = hub?.profile ?? null;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.halves)}
          />
        </View>
      }
    >
      <Reveal>
        <PageHero
          color="tomato"
          icon="shield"
          title={t('halves.settingsScreen.title')}
          body={t('halves.settingsScreen.body')}
        />
      </Reveal>
      {!hub || !profile ? (
        <LoadState
          failed={state.phase === 'failed' || (hub !== null && !profile)}
          loadingLabel={t('halves.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('halves.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text variant="labelMedium">
                {t('halves.settingsScreen.codename', { codename: profile.codename })}
              </Text>
              <TextButton
                tone="primary"
                label={t('halves.joinScreen.reroll')}
                onPress={() => void change(() => api.rerollHalvesCodename())}
              />
            </View>
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <View className="gap-1.5">
              <ToggleRow
                label={t('halves.settingsScreen.pause')}
                value={profile.paused}
                onChange={(paused) => void change(() => api.changeHalves({ paused }))}
              />
              <Text variant="small" tone="muted">
                {t('halves.settingsScreen.pauseHint')}
              </Text>
            </View>
          </Reveal>
          <Reveal delay={staggerDelay(3)}>
            <ToggleRow
              label={t('halves.settingsScreen.veil')}
              value={profile.veilDefault}
              onChange={(veilDefault) => void change(() => api.changeHalves({ veilDefault }))}
            />
          </Reveal>
          <Reveal delay={staggerDelay(4)}>
            <PlacePicker
              cities={hub.cities}
              countries={hub.countries}
              value={profile.place}
              onChange={(place) =>
                void change(() => api.changeHalves(place ? { place } : { clearPlace: true }))
              }
            />
          </Reveal>
          <Reveal delay={staggerDelay(5)}>
            <View className="gap-2">
              <Text variant="section" accessibilityRole="header">
                {t('halves.settingsScreen.blocked')}
              </Text>
              {hub.blocks.length === 0 ? (
                <Text tone="muted">{t('halves.settingsScreen.noBlocked')}</Text>
              ) : (
                hub.blocks.map((block) => (
                  <View key={block.id} className="flex-row items-center justify-between gap-2">
                    <Text>{block.codename}</Text>
                    <TextButton
                      tone="primary"
                      label={t('halves.settingsScreen.unblock')}
                      onPress={() =>
                        void change(async () => {
                          await api.removeHalvesBlock(block.id);
                          return api.getHalves();
                        })
                      }
                    />
                  </View>
                ))
              )}
            </View>
          </Reveal>
          {hub.duos.length > 0 ? (
            <Reveal delay={staggerDelay(6)}>
              <View className="gap-2">
                <Text variant="section" accessibilityRole="header">
                  {t('halves.settingsScreen.duos')}
                </Text>
                {hub.duos.map((duo) => (
                  <View key={duo.id} className="flex-row items-center justify-between gap-2">
                    <Text>{duo.codename}</Text>
                    <TextButton
                      tone="primary"
                      label={t('halves.settingsScreen.removeDuo')}
                      onPress={() =>
                        void change(async () => {
                          await api.removeHalvesDuo(duo.id);
                          return api.getHalves();
                        })
                      }
                    />
                  </View>
                ))}
              </View>
            </Reveal>
          ) : null}
          <Button
            variant="danger"
            label={t('halves.settingsScreen.leave')}
            onPress={() => setLeaving(true)}
          />
          <ConfirmSheet
            visible={leaving}
            title={t('halves.settingsScreen.leave')}
            body={t('halves.settingsScreen.leaveBody')}
            confirmLabel={t('halves.settingsScreen.leaveConfirm')}
            cancelLabel={t('halves.case.cancel')}
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
