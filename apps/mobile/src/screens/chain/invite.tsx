import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
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
import { TextField } from '@/components/text-field';
import { useChainApi, useChainStory } from '@/chain/services';
import { formatDate } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { chainStoryRoute, chainTurnRoute, ROUTES } from '@/lib/routes';
import { failureKey, redeemFailureKey } from './parts';

// A code is ten characters; a pasted one may carry spaces.
const CODE_MAX = 16;

/**
 * 9.9 Invite friends: the story's code for its free seats, shared through the phone's own share
 * sheet. A friend who learns the same language takes a seat with it (adults only).
 */
export function ChainInviteScreen() {
  const { t, i18n } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useChainApi();
  const { state, refresh, set } = useChainStory(signedIn ? (id ?? null) : null);
  const [failure, setFailure] = useState<string | null>(null);
  const story = state.phase === 'ready' ? state.data : null;

  // A host whose code has run out gets a new one when they open this screen.
  useEffect(() => {
    if (!story || story.inviteCode || !story.canFill || !story.host) return;
    api
      .createChainInvite(story.id)
      .then(set, (error: unknown) => setFailure(t(failureKey(apiErrorCode(error)))));
  }, [api, story, set, t]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const code = story?.inviteCode ?? null;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(id ? chainStoryRoute(id) : ROUTES.chain)}
          />
        </View>
      }
      actions={
        story?.myTurn ? (
          <Button
            label={t('chain.story.recordNow')}
            onPress={() => router.replace(chainTurnRoute(story.id))}
          />
        ) : undefined
      }
    >
      <Reveal>
        <PageHero
          color="pink"
          icon="send"
          title={t('chain.inviteScreen.title')}
          body={t('chain.inviteScreen.body')}
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
      ) : !code ? (
        failure ? (
          <NoticeBox icon="info" tone="warn">
            {failure}
          </NoticeBox>
        ) : (
          <Text tone="muted">{t('chain.inviteScreen.none')}</Text>
        )
      ) : (
        <Reveal delay={staggerDelay(1)}>
          <Card className="items-center gap-2.5 p-5">
            <Text variant="labelSmall" tone="muted">
              {t('chain.inviteScreen.code')}
            </Text>
            <Pop>
              <Text variant="title" selectable className="text-center">
                {code}
              </Text>
            </Pop>
            {story.inviteExpiresAt ? (
              <Text variant="small" tone="muted" className="text-center">
                {t('chain.inviteScreen.expires', {
                  date: formatDate(i18n.language, story.inviteExpiresAt.slice(0, 10)),
                })}
              </Text>
            ) : null}
            <Button
              label={t('chain.inviteScreen.share')}
              onPress={() => {
                commitFeedback();
                void Share.share({ message: t('chain.inviteScreen.shareMessage', { code }) });
              }}
            />
          </Card>
        </Reveal>
      )}
    </StepLayout>
  );
}

/** 9.9 Take a seat in a friend's story with the code they gave. */
export function ChainRedeemScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const api = useChainApi();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function redeem() {
    commitFeedback();
    setBusy(true);
    setFailure(null);
    try {
      const story = await api.redeemChainInvite(code.trim());
      router.replace(story.myTurn ? chainTurnRoute(story.id) : chainStoryRoute(story.id));
    } catch (error) {
      setFailure(t(redeemFailureKey(apiErrorCode(error))));
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
          label={t('chain.redeemScreen.send')}
          disabled={code.trim().length < 4}
          loading={busy}
          onPress={() => void redeem()}
        />
      }
    >
      <Reveal>
        <PageHero
          color="pink"
          icon="key"
          title={t('chain.redeemScreen.title')}
          body={t('chain.redeemScreen.body')}
        />
      </Reveal>
      <Reveal delay={staggerDelay(1)}>
        <TextField
          label={t('chain.redeemScreen.code')}
          value={code}
          onChangeText={setCode}
          maxLength={CODE_MAX}
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </Reveal>
      {failure ? (
        <NoticeBox icon="info" tone="warn">
          {failure}
        </NoticeBox>
      ) : null}
    </StepLayout>
  );
}
