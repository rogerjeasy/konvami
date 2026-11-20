import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Halves, HalvesCaseSummary } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { OptionCard } from '@/components/option-card';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useHalvesApi, useHalvesHub } from '@/halves/services';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { halvesCaseRoute, ROUTES } from '@/lib/routes';
import { HalvesMotif } from './halves-motif';
import { failureKey } from './parts';

// The small drawing of the two halves on the hub's search card (pt).
const SEARCH_MOTIF = 64;

function CaseRow({ found }: { found: HalvesCaseSummary }) {
  const { t } = useTranslation();
  const waiting = found.next === 'record' || found.next === 'answer' || found.next === 'final';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${found.title}, ${t(`halves.next.${found.next}`)}`}
      onPress={() => router.push(halvesCaseRoute(found.id))}
    >
      <Card className="min-h-tap gap-1.5 p-4">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="labelMedium" className="flex-1">
            {found.title}
          </Text>
          {waiting ? <Badge label={t(`halves.next.${found.next}`)} /> : null}
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="small" tone="muted">
            {t('halves.case.against', { name: found.partner.name })}
          </Text>
          {found.partner.ai ? <Badge label={t('halves.ai')} tone="chip" /> : null}
          {!waiting ? (
            <Text variant="small" tone="muted">
              · {t(`halves.next.${found.next}`)}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

function HowItWorks() {
  const { t } = useTranslation();
  return (
    <Card className="gap-2.5 p-4">
      <Text variant="section" accessibilityRole="header">
        {t('halves.how.title')}
      </Text>
      {(['one', 'two', 'three', 'private'] as const).map((step) => (
        <Text key={step} tone="muted">
          {t(`halves.how.${step}`)}
        </Text>
      ))}
    </Card>
  );
}

/**
 * 7.1 Two Halves: the learner's cases, what each one waits for, and ways to start one (against an
 * AI, this week's case, with a friend, with a duo). Phase 1: no stranger hears a stranger.
 */
export function HalvesScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const api = useHalvesApi();
  const { state, refresh } = useHalvesHub(signedIn);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function start(key: string, begin: () => Promise<{ id: string }>) {
    commitFeedback();
    setBusy(key);
    setFailure(null);
    try {
      const found = await begin();
      router.push(halvesCaseRoute(found.id));
    } catch (error) {
      setFailure(t(failureKey(apiErrorCode(error))));
    } finally {
      setBusy(null);
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const hub: Halves | null = state.phase === 'ready' ? state.data : null;
  const profile = hub?.profile ?? null;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center justify-between">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.talk)}
          />
          {profile ? (
            <TextButton
              tone="primary"
              label={t('halves.settings')}
              onPress={() => router.push(ROUTES.halvesSettings)}
            />
          ) : null}
        </View>
      }
      actions={
        hub?.available && !profile ? (
          <Button label={t('halves.join')} onPress={() => router.push(ROUTES.halvesJoin)} />
        ) : hub?.available && profile ? (
          // The main way to play is pinned, so it stays on screen on a small phone.
          <Button
            label={t('halves.playAi')}
            loading={busy === 'ai'}
            disabled={busy !== null}
            onPress={() => void start('ai', () => api.startHalvesCase({}))}
          />
        ) : undefined
      }
    >
      <Reveal>
        <PageHero color="tomato" icon="compass" title={t('halves.title')} body={t('halves.body')} />
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
      ) : !hub.available ? (
        <NoticeBox icon="info">{t('halves.closed')}</NoticeBox>
      ) : !profile ? (
        <Reveal delay={staggerDelay(1)}>
          <HowItWorks />
        </Reveal>
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <View className="gap-1">
              <Text tone="muted">{t('halves.playingAs', { codename: profile.codename })}</Text>
              {hub.told > 0 ? (
                <Text variant="small" accessibilityHint={t('halves.heard.private')}>
                  {t('halves.heard.hub', { understood: hub.understoodFirst, told: hub.told })}
                </Text>
              ) : null}
            </View>
          </Reveal>
          {hub.search ? (
            <Reveal delay={staggerDelay(1)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('halves.find.looking')}
                onPress={() => router.push(ROUTES.halvesFind)}
              >
                <Card className="min-h-tap flex-row items-center gap-3 p-4">
                  <HalvesMotif size={SEARCH_MOTIF} />
                  <View className="flex-1 gap-0.5">
                    <Text variant="labelMedium">{t('halves.find.looking')}</Text>
                    <Text variant="small" tone="muted">
                      {hub.search.offerAi ? t('halves.find.offer') : t('halves.find.lookingBody')}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            </Reveal>
          ) : null}
          {failure ? (
            <NoticeBox icon="info" tone="warn">
              {failure}
            </NoticeBox>
          ) : null}
          <Reveal delay={staggerDelay(2)}>
            <View className="gap-2.5">
              <Text variant="section" accessibilityRole="header">
                {t('halves.yourCases')}
              </Text>
              {hub.cases.length === 0 ? (
                <Text tone="muted">{t('halves.noCases')}</Text>
              ) : (
                hub.cases.map((found) => <CaseRow key={found.id} found={found} />)
              )}
            </View>
          </Reveal>
          <Reveal delay={staggerDelay(3)}>
            <View className="gap-2.5">
              <Text variant="section" accessibilityRole="header">
                {t('halves.start')}
              </Text>
              <Text variant="small" tone="muted">
                {t('halves.playAiHint')}
              </Text>
              {hub.strangers && !hub.search ? (
                <OptionCard
                  role="radio"
                  selected={false}
                  label={t('halves.find.hub')}
                  description={t('halves.find.hubHint')}
                  onPress={() => router.push(ROUTES.halvesFind)}
                />
              ) : null}
              <OptionCard
                role="radio"
                selected={false}
                label={t('halves.season', { title: hub.seasonTitle })}
                description={t('halves.seasonHint')}
                disabled={busy !== null}
                onPress={() => void start('season', () => api.startHalvesCase({ season: true }))}
              />
              <OptionCard
                role="radio"
                selected={false}
                label={t('halves.fromImport.row')}
                description={t('halves.fromImport.rowHint')}
                onPress={() => router.push(ROUTES.halvesFromImport)}
              />
              {profile.band === 'adult' ? (
                <OptionCard
                  role="radio"
                  selected={false}
                  label={t('halves.invite')}
                  description={t('halves.inviteHint')}
                  onPress={() => router.push(ROUTES.halvesInvite)}
                />
              ) : (
                <Text variant="small" tone="muted">
                  {t('halves.adultsOnly')}
                </Text>
              )}
            </View>
          </Reveal>
          <Reveal delay={staggerDelay(4)}>
            <OptionCard
              role="radio"
              selected={false}
              label={t('halves.strands.row')}
              description={t('halves.strands.rowHint')}
              onPress={() => router.push(ROUTES.halvesStrands)}
            />
          </Reveal>
          {hub.duos.length > 0 ? (
            <Reveal delay={staggerDelay(5)}>
              <View className="gap-2.5">
                <Text variant="section" accessibilityRole="header">
                  {t('halves.duos')}
                </Text>
                {hub.duos.map((duo) => (
                  <Button
                    key={duo.id}
                    variant="secondary"
                    label={t('halves.duoStart', { codename: duo.codename })}
                    loading={busy === duo.id}
                    disabled={busy !== null}
                    onPress={() => void start(duo.id, () => api.startHalvesDuoCase(duo.id))}
                  />
                ))}
              </View>
            </Reveal>
          ) : null}
        </>
      )}
    </StepLayout>
  );
}
