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
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { OptionCard } from '@/components/option-card';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Stepper } from '@/components/stepper';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useHalvesApi, useHalvesSearch } from '@/halves/services';
import { formatClock } from '@/lib/format';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { halvesCaseRoute, ROUTES } from '@/lib/routes';
import { HalvesMotif } from './halves-motif';
import { failureKey } from './parts';

// The search can last from the shortest to the longest the server allows, in these steps (h).
const HOUR_STEP = 2;
// The drawing of the two halves looking for each other (pt).
const MOTIF = 144;

/** The hours a search may last, from the server's shortest, usual and longest. */
export function searchHours([least, , most]: readonly number[]): number[] {
  const low = least ?? HOUR_STEP;
  const high = most ?? low;
  const hours: number[] = [];
  for (let hour = low; hour <= high; hour += HOUR_STEP) hours.push(hour);
  return hours;
}

/**
 * 7.3 Finding a partner: look for an adult who grew up with the language the learner learns (and
 * learns theirs), for a few hours they choose; meanwhile, or instead, an AI plays at once.
 * Shown only where the server matches strangers (after the legal review) and to adults.
 */
export function HalvesFindScreen() {
  const { t, i18n } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const api = useHalvesApi();
  const { state, refresh, set } = useHalvesSearch(signedIn);
  const hub = state.phase === 'ready' ? state.data : null;
  const [hours, setHours] = useState<number | null>(null);
  const [remind, setRemind] = useState(true);
  const [busy, setBusy] = useState<'look' | 'ai' | 'stop' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const options = hub ? searchHours(hub.searchHours) : [];
  const chosen = hours ?? hub?.searchHours[1] ?? options[0] ?? HOUR_STEP;
  const search = hub?.search ?? null;

  async function run(key: 'look' | 'ai' | 'stop', work: () => Promise<void>) {
    commitFeedback();
    setBusy(key);
    setFailure(null);
    try {
      await work();
    } catch (error) {
      const code = apiErrorCode(error);
      setFailure(code === 'adults_only' ? t('halves.find.adultsOnly') : t(failureKey(code)));
    } finally {
      setBusy(null);
    }
  }

  const look = () =>
    run('look', async () => {
      const found = await api.lookForHalvesPartner({ hours: chosen, remind });
      if (found.case) {
        successFeedback();
        router.replace(halvesCaseRoute(found.case.id));
        return;
      }
      if (hub) set({ ...hub, search: found.search });
    });
  const playAi = () =>
    run('ai', async () => {
      const found = await api.startHalvesCase({});
      router.replace(halvesCaseRoute(found.id));
    });
  const stop = () =>
    run('stop', async () => {
      await api.stopHalvesSearch();
      if (hub) set({ ...hub, search: null });
    });

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
      actions={
        hub?.strangers ? (
          <Button
            label={search ? t('halves.find.keep') : t('halves.find.start')}
            loading={busy === 'look'}
            disabled={busy !== null}
            onPress={() => void look()}
          />
        ) : undefined
      }
    >
      <Reveal>
        <PageHero
          color="tomato"
          icon="users"
          title={t('halves.find.title')}
          body={t('halves.find.body')}
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
      ) : !hub.strangers ? (
        <NoticeBox icon="info">
          {hub.profile?.band === 'adult' ? t('halves.find.closed') : t('halves.find.adultsOnly')}
        </NoticeBox>
      ) : (
        <>
          {search ? (
            <Reveal delay={staggerDelay(1)}>
              <Card className="items-center gap-3 p-5">
                <HalvesMotif size={MOTIF} />
                <View aria-live="polite" className="items-center gap-1.5">
                  <Text variant="section" accessibilityRole="header" className="text-center">
                    {t('halves.find.looking')}
                  </Text>
                  <Text tone="muted" className="text-center">
                    {t('halves.find.lookingBody')}
                  </Text>
                  <Text variant="small" tone="muted" className="text-center">
                    {t('halves.find.until', { time: formatClock(i18n.language, search.until) })}
                  </Text>
                </View>
                <TextButton
                  label={t('halves.find.stop')}
                  disabled={busy !== null}
                  onPress={() => void stop()}
                />
              </Card>
            </Reveal>
          ) : null}
          {search?.offerAi ? (
            <Pop>
              <NoticeBox icon="info">{t('halves.find.offer')}</NoticeBox>
            </Pop>
          ) : null}
          {failure ? (
            <NoticeBox icon="info" tone="warn">
              {failure}
            </NoticeBox>
          ) : null}
          <Reveal delay={staggerDelay(2)}>
            <Card className="gap-3 p-4">
              <Stepper
                title={t('halves.find.hours')}
                options={options}
                value={chosen}
                onChange={setHours}
                number={(value) => String(value)}
                unit={() => t('halves.find.hoursUnit')}
                label={(value) => t('halves.find.hoursLabel', { count: value })}
                lessLabel={t('halves.find.less')}
                moreLabel={t('halves.find.more')}
              />
              <ToggleRow label={t('halves.find.remind')} value={remind} onChange={setRemind} />
            </Card>
          </Reveal>
          <Reveal delay={staggerDelay(3)}>
            <OptionCard
              role="radio"
              selected={false}
              label={t('halves.find.ai')}
              description={t('halves.find.aiHint')}
              disabled={busy !== null}
              onPress={() => void playAi()}
            />
          </Reveal>
          <Reveal delay={staggerDelay(4)}>
            <Text variant="small" tone="muted">
              {t('halves.find.safety')}
            </Text>
          </Reveal>
        </>
      )}
    </StepLayout>
  );
}
