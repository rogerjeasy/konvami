import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Plan } from '@konvami/api-client';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { NoticeBox } from '@/components/notice-box';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import type { StoreOffer } from '@/plan/device';
import { readUntilChanged } from '@/plan/refresh';
import { useOffers, usePaywall, usePurchaseDevice, type PaywallReason } from '@/plan/services';
import { usePlan, useProfileServices } from '@/profile/services';
import { TierSummary } from './tier-summary';

// The longest the sheet is, as a share of the window: the offers scroll inside it.
const MAX_HEIGHT_SHARE = 0.7;

/** One way to buy: the store's price, and the free days when the store gives them. */
function OfferButton({
  offer,
  busy,
  onBuy,
}: {
  offer: StoreOffer;
  busy: boolean;
  onBuy: (offer: StoreOffer) => void;
}) {
  const { t } = useTranslation();
  const period =
    offer.period === null
      ? ''
      : ` · ${t(offer.period === 'month' ? 'plan.paywall.month' : 'plan.paywall.year')}`;
  return (
    <Button
      variant={offer.trialDays !== null ? 'primary' : 'secondary'}
      label={`${offer.price}${period}`}
      detail={
        offer.trialDays !== null
          ? t('plan.paywall.trialDays', { count: offer.trialDays })
          : undefined
      }
      disabled={busy}
      onPress={() => onBuy(offer)}
    />
  );
}

/**
 * The sheet that offers the plans (spec §6.21.2), opened from the Plan screen, when a feature the
 * plan lacks is asked for, and when the week's minutes are used up. Prices, trials and names
 * come from the store; what each plan includes comes from the server. After a purchase the plan
 * is read again until the store's message has reached the server.
 */
export function PaywallSheet() {
  const { t } = useTranslation();
  const { reason, close } = usePaywall();
  const device = usePurchaseDevice();
  const offers = useOffers(reason !== null);
  const state = usePlan();
  const { plan, allowance } = useProfileServices();
  const { height } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'purchase' | null>(null);

  async function buy(offer: StoreOffer) {
    commitFeedback();
    setBusy(true);
    setProblem(null);
    try {
      const before = plan.getState().data;
      if ((await device.purchase(offer.id)) === 'cancelled') return;
      successFeedback();
      close();
      // The store tells the server; the sheet is gone, the plan catches up on its own.
      void readUntilChanged(before, async () => {
        await plan.refresh();
        void allowance.refresh();
        return plan.getState().data;
      });
    } catch {
      setProblem('purchase');
    } finally {
      setBusy(false);
    }
  }

  const tiers: Plan['tiers'] = state.phase === 'ready' ? state.data.tiers : [];
  const subscriptions =
    offers.phase === 'ready' ? offers.offers.filter((o) => o.kind === 'subscription') : [];
  const packs = offers.phase === 'ready' ? offers.offers.filter((o) => o.kind === 'pack') : [];

  return (
    <Sheet visible={reason !== null} title={t('plan.paywall.title')} onClose={close}>
      <ScrollView
        style={{ maxHeight: height * MAX_HEIGHT_SHARE }}
        contentContainerClassName="gap-4 pb-2"
      >
        {reason ? (
          <Text variant="small" tone="muted">
            {t(`plan.paywall.reasons.${reason satisfies PaywallReason}`)}
          </Text>
        ) : null}
        {!device.available ? (
          <NoticeBox icon="alert">{t('plan.unavailable')}</NoticeBox>
        ) : offers.phase === 'failed' ? (
          <View className="gap-1">
            <Text variant="small" tone="muted">
              {t('plan.paywall.loadFailed')}
            </Text>
            <TextButton tone="primary" label={t('common.retry')} onPress={offers.reload} />
          </View>
        ) : offers.phase === 'loading' ? (
          <Text variant="small" tone="muted">
            {t('common.loading')}
          </Text>
        ) : (
          <>
            {(['plus', 'pro'] as const).map((tier) => {
              const own = subscriptions.filter((o) => o.tier === tier);
              const info = tiers.find((entry) => entry.tier === tier);
              if (own.length === 0) return null;
              return (
                <Card key={tier} className="gap-3 p-4">
                  <Text variant="heading" accessibilityRole="header">
                    {t(`plan.tiers.${tier}`)}
                  </Text>
                  {info ? <TierSummary info={info} /> : null}
                  <View className="gap-2">
                    {own.map((offer) => (
                      <OfferButton key={offer.id} offer={offer} busy={busy} onBuy={buy} />
                    ))}
                  </View>
                </Card>
              );
            })}
            {packs.length > 0 ? (
              <Card className="gap-3 p-4">
                <Text variant="heading" accessibilityRole="header">
                  {t('plan.paywall.packs')}
                </Text>
                <Text variant="small" tone="muted">
                  {t('plan.paywall.packsBody')}
                </Text>
                {packs.map((offer) => (
                  <Button
                    key={offer.id}
                    variant="secondary"
                    label={offer.title}
                    detail={offer.price}
                    disabled={busy}
                    onPress={() => void buy(offer)}
                  />
                ))}
              </Card>
            ) : null}
            <Text variant="caption" tone="subtle">
              {t('plan.paywall.renewal')}
            </Text>
          </>
        )}
        {problem ? (
          <View accessibilityLiveRegion="polite">
            <NoticeBox icon="alert" tone="danger">
              {t('plan.paywall.purchaseFailed')}
            </NoticeBox>
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
