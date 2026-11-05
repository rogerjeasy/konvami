import { useTranslation } from 'react-i18next';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback } from '@/lib/haptics';
import { useOffers, usePaywall, usePurchaseDevice } from '@/plan/services';
import { usePlan } from '@/profile/services';

/**
 * 4.8 Ready: the free trial of Plus (spec §6.21.2), offered once, when the store has one for
 * this learner and plans are on. The days come from the store's introductory offer, never from
 * the app. It shows nothing where nothing can be bought (the web preview, a build without the
 * store, the testers' time) and nothing until the store has answered.
 */
export function TrialOffer() {
  const { t } = useTranslation();
  const device = usePurchaseDevice();
  const paywall = usePaywall();
  const state = usePlan();
  const offers = useOffers(device.available);
  const trial =
    offers.phase === 'ready'
      ? offers.offers.find((o) => o.kind === 'subscription' && o.tier === 'plus' && o.trialDays)
      : undefined;
  const plan = state.phase === 'ready' ? state.data : null;
  if (!trial?.trialDays || !plan?.enforced || plan.tier !== 'free') return null;
  return (
    <Card className="gap-1.5 bg-bg p-4">
      <Text variant="label" accessibilityRole="header">
        {t('plan.ready.trial', { count: trial.trialDays })}
      </Text>
      <Text variant="small" tone="muted">
        {t('plan.ready.body')}
      </Text>
      <TextButton
        tone="primary"
        label={t('plan.ready.see')}
        onPress={() => {
          commitFeedback();
          paywall.open('trial');
        }}
      />
    </Card>
  );
}
