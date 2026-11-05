import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Plan } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LoadState } from '@/components/load-state';
import { Meter } from '@/components/meter';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { openLink } from '@/lib/external';
import { formatDate } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { readUntilChanged } from '@/plan/refresh';
import { usePaywall, usePurchaseDevice } from '@/plan/services';
import { useAllowance, usePlan, useProfileServices } from '@/profile/services';
import { ProfilePage } from '../profile/page';
import { TierSummary } from './tier-summary';

// A stored moment ("2026-10-09T12:00:00Z") as its calendar day.
const DAY_LENGTH = 'YYYY-MM-DD'.length;
const SECONDS_PER_MINUTE = 60;

/** The line under the plan's name: when a trial ends, when it renews or when it ends. */
function Standing({ plan }: { plan: Plan }) {
  const { t, i18n } = useTranslation();
  if (!plan.expiresAt) return null;
  const date = formatDate(i18n.language, plan.expiresAt.slice(0, DAY_LENGTH));
  const key = plan.trial ? 'plan.trialUntil' : plan.autoRenew ? 'plan.renews' : 'plan.endsOn';
  return (
    <Text variant="small" tone="muted">
      {t(key, { date })}
    </Text>
  );
}

/** Voice minutes left this week out of the plan's, as a bar. */
function Minutes() {
  const { t } = useTranslation();
  const state = useAllowance();
  if (state.phase !== 'ready') return null;
  const { weeklySeconds, remainingSeconds } = state.data;
  const weekly = Math.round(weeklySeconds / SECONDS_PER_MINUTE);
  const left = Math.floor(remainingSeconds / SECONDS_PER_MINUTE);
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Text variant="heading">{t('profile.minutes.left', { count: left })}</Text>
        <Text variant="small" tone="muted">
          {t('profile.minutes.ofWeekly', { weekly })}
        </Text>
      </View>
      <Meter
        share={weeklySeconds > 0 ? remainingSeconds / weeklySeconds : 0}
        label={t('profile.minutes.spoken', { left, weekly })}
      />
    </View>
  );
}

/**
 * 6.17 Plan (spec §6.21.2, §6.19): the plan the learner has and what it includes, this week's
 * voice minutes and the minutes bought in packs, and the way to change it: see the plans, restore
 * purchases made on another phone, and the store's own page for cancelling. While plans are not
 * enforced (testing) it says that every feature is open instead.
 */
export function PlanScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { plan: store, allowance } = useProfileServices();
  const state = usePlan();
  const device = usePurchaseDevice();
  const paywall = usePaywall();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    void store.refresh();
    void allowance.refresh();
  }, [signedIn, store, allowance]);

  async function restore() {
    setBusy(true);
    setNote(null);
    try {
      const before = store.getState().data;
      await device.restore();
      setNote(t('plan.restored'));
      // The server hears of restored purchases from the store a little later: the plan catches up.
      void readUntilChanged(before, async () => {
        await store.refresh();
        return store.getState().data;
      });
    } catch {
      setNote(t('plan.restoreFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function manage() {
    setNote(null);
    const url = await device.manageUrl().catch(() => null);
    if (url) openLink(url);
    else setNote(t('plan.manageFailed'));
  }

  return (
    <ProfilePage title={t('plan.title')} body={t('plan.body')}>
      {state.phase === 'ready' ? (
        <PlanBody
          plan={state.data}
          canBuy={device.available}
          busy={busy}
          note={note}
          onSee={() => paywall.open('plans')}
          onRestore={() => void restore()}
          onManage={() => void manage()}
        />
      ) : (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('common.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(state.error === 'network' ? 'errors.network' : 'plan.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      )}
    </ProfilePage>
  );
}

function PlanBody({
  plan,
  canBuy,
  busy,
  note,
  onSee,
  onRestore,
  onManage,
}: {
  plan: Plan;
  canBuy: boolean;
  busy: boolean;
  note: string | null;
  onSee: () => void;
  onRestore: () => void;
  onManage: () => void;
}) {
  const { t } = useTranslation();
  const info = plan.tiers.find((entry) => entry.tier === plan.tier);
  const weekly = Math.round(plan.weeklySeconds / SECONDS_PER_MINUTE);
  return (
    <View className="gap-4">
      <Reveal delay={staggerDelay(1)}>
        <Card className="gap-3 p-4">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text variant="heading" accessibilityRole="header">
              {t(`plan.tiers.${plan.tier}`)}
            </Text>
            {plan.trial ? <Badge label={t('plan.trial')} /> : null}
          </View>
          <Standing plan={plan} />
          {plan.enforced && info ? (
            <TierSummary info={info} />
          ) : (
            <Text variant="small" tone="muted">
              {t('plan.testing', { count: weekly })}
            </Text>
          )}
        </Card>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <Card className="gap-3 p-4">
          <Minutes />
          {plan.packSeconds > 0 ? (
            <Text variant="small" tone="muted">
              {t('plan.packLeft', { count: Math.floor(plan.packSeconds / SECONDS_PER_MINUTE) })}
            </Text>
          ) : null}
        </Card>
      </Reveal>
      {plan.billingIssue ? (
        <NoticeBox icon="alert" tone="danger">
          {t('plan.billingIssue')}
        </NoticeBox>
      ) : null}
      {plan.enforced && !canBuy ? (
        <NoticeBox icon="alert">{t('plan.unavailable')}</NoticeBox>
      ) : null}
      {note ? (
        <View accessibilityLiveRegion="polite">
          <NoticeBox icon="check" tone="primary">
            {note}
          </NoticeBox>
        </View>
      ) : null}
      {plan.enforced && canBuy ? (
        <Reveal delay={staggerDelay(3)}>
          <View className="items-center gap-3">
            {plan.tier !== 'pro' ? <Button label={t('plan.see')} onPress={onSee} /> : null}
            {plan.tier !== 'free' ? (
              <TextButton tone="primary" label={t('plan.manage')} onPress={onManage} />
            ) : null}
            <TextButton
              tone="primary"
              label={t('plan.restore')}
              disabled={busy}
              onPress={onRestore}
            />
          </View>
        </Reveal>
      ) : null}
    </View>
  );
}
