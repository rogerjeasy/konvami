import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ToggleRow } from '@/components/choice-group';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { useChainApi } from '@/chain/services';
import { successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { failureKey } from './parts';

/**
 * 9.2 Join the story chain: what the other players hear, the voice-sharing consent (its own
 * record, `chain_voice` version 1) and whether lines are veiled by default. The codename is made
 * up by the server.
 */
export function ChainJoinScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const api = useChainApi();
  const [consent, setConsent] = useState(false);
  const [veil, setVeil] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setFailure(null);
    try {
      await api.joinChain({ veilDefault: veil, voiceConsent: consent });
      successFeedback();
      router.replace(ROUTES.chain);
    } catch (error) {
      setFailure(t(failureKey(apiErrorCode(error))));
    } finally {
      setBusy(false);
    }
  }

  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
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
      actions={
        <Button
          label={t('chain.joinScreen.send')}
          disabled={!consent}
          loading={busy}
          onPress={() => void join()}
        />
      }
    >
      <Reveal>
        <PageHero
          color="pink"
          icon="users"
          title={t('chain.joinScreen.title')}
          body={t('chain.joinScreen.body')}
        />
      </Reveal>
      <Reveal delay={staggerDelay(1)}>
        <Card className="gap-2 p-4">
          <Text variant="section" accessibilityRole="header">
            {t('chain.joinScreen.consentTitle')}
          </Text>
          <Text tone="muted">{t('chain.joinScreen.consentBody')}</Text>
        </Card>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <ToggleRow label={t('chain.joinScreen.consent')} value={consent} onChange={setConsent} />
      </Reveal>
      <Reveal delay={staggerDelay(3)}>
        <View className="gap-1">
          <ToggleRow label={t('chain.joinScreen.veil')} value={veil} onChange={setVeil} />
          <Text variant="small" tone="muted">
            {t('chain.joinScreen.veilHint')}
          </Text>
        </View>
      </Reveal>
      <Reveal delay={staggerDelay(4)}>
        <Text variant="small" tone="muted">
          {t('chain.joinScreen.minor')}
        </Text>
      </Reveal>
      {failure ? (
        <NoticeBox icon="info" tone="warn">
          {failure}
        </NoticeBox>
      ) : null}
    </StepLayout>
  );
}
