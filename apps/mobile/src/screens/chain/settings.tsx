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
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useChainApi, useChainHub } from '@/chain/services';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';

/**
 * 9.8 Story chain settings: Veil by default, a pause, another codename, the players blocked (in
 * either game), and deleting one's story-chain data, which withdraws the voice-sharing consent.
 */
export function ChainSettingsScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const api = useChainApi();
  const { state, refresh, set } = useChainHub(signedIn);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const hub = state.phase === 'ready' ? state.data : null;
  const profile = hub?.profile ?? null;

  async function leave() {
    setBusy(true);
    try {
      await api.leaveChain();
      router.replace(ROUTES.chain);
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
            onPress={() => backOr(ROUTES.chain)}
          />
        </View>
      }
    >
      <Reveal>
        <PageHero color="pink" icon="shield" title={t('chain.settingsScreen.title')} />
      </Reveal>
      {!profile ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('chain.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('chain.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <Card className="gap-3 p-4">
              <View className="gap-1">
                <ToggleRow
                  label={t('chain.settingsScreen.veil')}
                  value={profile.veilDefault}
                  onChange={(veilDefault) => void api.changeChain({ veilDefault }).then(set)}
                />
                <Text variant="small" tone="muted">
                  {t('chain.settingsScreen.veilHint')}
                </Text>
              </View>
              <View className="gap-1">
                <ToggleRow
                  label={t('chain.settingsScreen.pause')}
                  value={profile.paused}
                  onChange={(paused) => void api.changeChain({ paused }).then(set)}
                />
                <Text variant="small" tone="muted">
                  {t('chain.settingsScreen.pauseHint')}
                </Text>
              </View>
            </Card>
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <Card className="gap-2 p-4">
              <Text variant="labelSmall" tone="muted">
                {t('chain.settingsScreen.codename')}
              </Text>
              <Text variant="section">{profile.codename}</Text>
              <TextButton
                tone="primary"
                label={t('chain.settingsScreen.reroll')}
                onPress={() => {
                  commitFeedback();
                  void api.rerollChainCodename().then(set);
                }}
              />
            </Card>
          </Reveal>
          <Reveal delay={staggerDelay(3)}>
            <View className="gap-2.5">
              <Text variant="section" accessibilityRole="header">
                {t('chain.settingsScreen.blocked')}
              </Text>
              {hub?.blocks.length ? (
                hub.blocks.map((block) => (
                  <View key={block.id} className="min-h-tap flex-row items-center gap-3">
                    <Text className="flex-1">{block.codename}</Text>
                    <TextButton
                      tone="primary"
                      label={t('chain.settingsScreen.unblock')}
                      onPress={() =>
                        void api.removeChainBlock(block.id).then(() => api.getChain().then(set))
                      }
                    />
                  </View>
                ))
              ) : (
                <Text tone="muted">{t('chain.settingsScreen.noBlocks')}</Text>
              )}
            </View>
          </Reveal>
          <Reveal delay={staggerDelay(4)}>
            <Button
              variant="danger"
              label={t('chain.settingsScreen.leave')}
              onPress={() => setLeaving(true)}
            />
          </Reveal>
          <ConfirmSheet
            visible={leaving}
            danger
            title={t('chain.settingsScreen.leave')}
            body={t('chain.settingsScreen.leaveBody')}
            confirmLabel={t('chain.settingsScreen.leaveConfirm')}
            cancelLabel={t('chain.cancel')}
            loading={busy}
            onConfirm={() => void leave()}
            onCancel={() => setLeaving(false)}
          />
        </>
      )}
    </StepLayout>
  );
}
