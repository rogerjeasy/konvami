import { useState } from 'react';
import { Share, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextField } from '@/components/text-field';
import { useHalvesApi, useHalvesHub } from '@/halves/services';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { halvesCaseRoute, ROUTES } from '@/lib/routes';
import { inviteFailureKey } from './parts';

// A code is six characters; a pasted one may carry spaces.
const CODE_MAX = 16;

/**
 * 7.12 Invite a friend: a code to give them (once, for seven days), shared through the phone's
 * own share sheet, and the field for a code a friend gave. Adults only in phase 1.
 */
export function HalvesInviteScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const api = useHalvesApi();
  const { state, refresh, set } = useHalvesHub(signedIn);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function make() {
    commitFeedback();
    setBusy(true);
    setFailure(null);
    try {
      await api.createHalvesInvite();
      set(await api.getHalves());
    } catch (error) {
      setFailure(t(inviteFailureKey(apiErrorCode(error))));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    commitFeedback();
    await api.cancelHalvesInvite();
    set(await api.getHalves());
  }

  async function redeem() {
    commitFeedback();
    setBusy(true);
    setFailure(null);
    try {
      const found = await api.redeemHalvesInvite(code.trim());
      router.replace(halvesCaseRoute(found.id));
    } catch (error) {
      setFailure(t(inviteFailureKey(apiErrorCode(error))));
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const hub = state.phase === 'ready' ? state.data : null;
  const invite = hub?.invite ?? null;
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
          icon="send"
          title={t('halves.inviteScreen.title')}
          body={t('halves.inviteScreen.body')}
        />
      </Reveal>
      {!hub ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('halves.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('halves.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : (
        <>
          {failure ? (
            <NoticeBox icon="info" tone="warn">
              {failure}
            </NoticeBox>
          ) : null}
          <Reveal delay={staggerDelay(1)}>
            {invite ? (
              <Card className="items-center gap-2.5 p-5">
                <Pop>
                  <Text variant="title" selectable className="text-center">
                    {t('halves.inviteScreen.code', { code: invite.code })}
                  </Text>
                </Pop>
                <Text variant="small" tone="muted" className="text-center">
                  {t('halves.inviteScreen.valid')}
                </Text>
                <Button
                  label={t('halves.inviteScreen.share')}
                  onPress={() =>
                    void Share.share({
                      message: t('halves.inviteScreen.shareText', { code: invite.code }),
                    })
                  }
                />
                <TextButton
                  tone="primary"
                  label={t('halves.inviteScreen.cancel')}
                  onPress={() => void cancel()}
                />
              </Card>
            ) : (
              <Button
                label={t('halves.inviteScreen.make')}
                loading={busy}
                onPress={() => void make()}
              />
            )}
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <View className="gap-2.5">
              <Text variant="section" accessibilityRole="header">
                {t('halves.inviteScreen.have')}
              </Text>
              <TextField
                label={t('halves.inviteScreen.field')}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={CODE_MAX}
              />
              <Button
                variant="secondary"
                label={t('halves.inviteScreen.redeem')}
                disabled={code.trim().length < 4}
                loading={busy}
                onPress={() => void redeem()}
              />
            </View>
          </Reveal>
        </>
      )}
    </StepLayout>
  );
}
