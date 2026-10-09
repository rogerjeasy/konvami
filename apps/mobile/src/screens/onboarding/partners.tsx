import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Persona } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PersonaAvatar } from '@/components/persona-avatar';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback, stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { partnerRoute, ROUTES } from '@/lib/routes';
import { StageGate } from '@/onboarding/gate';
import { useOnboardingStore } from '@/onboarding/services';
import type { OnboardingData } from '@/onboarding/store';
import { usePartners } from '@/onboarding/use-partners';

/** The top row: this screen is reached by settling the level, so there is no way back. */
const HEADER = <View className="min-h-tap" />;

function PartnerCard({
  partner,
  removable,
  busy,
  onRemove,
}: {
  partner: Persona;
  /** False for the last partner: onboarding needs at least one. */
  removable: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const { name } = partner;
  return (
    <Card className="gap-3 p-3.5 pb-1.5">
      <View className="flex-row items-start gap-3.5">
        <PersonaAvatar look={partner.look} diameter={size.avatarLg} />
        <View className="flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <Text variant="heading" className="shrink">
              {name}
            </Text>
            <View className="rounded-sm bg-primary-soft px-1.5 py-1">
              <Text variant="badge" tone="primary">
                {t(`onboarding.partners.roles.${partner.role}`)}
              </Text>
            </View>
          </View>
          <Text variant="small" tone="subtle">
            {t('onboarding.partners.ageOrigin', { age: partner.age, origin: partner.origin })}
          </Text>
          <Text variant="callout" tone="muted">
            {partner.tagline ?? t(`onboarding.partners.roleLines.${partner.role}`)}
          </Text>
        </View>
      </View>
      {confirming ? (
        <View className="flex-row flex-wrap items-center justify-between gap-x-2 border-t border-border pt-1.5">
          <Text variant="labelSmall" accessibilityLiveRegion="polite" className="shrink pl-1">
            {t('onboarding.partners.removeConfirm', { name })}
          </Text>
          <View className="flex-row">
            <TextButton
              label={t('onboarding.partners.removeNo')}
              onPress={() => setConfirming(false)}
            />
            <TextButton
              tone="primary"
              label={t('onboarding.partners.removeYes')}
              disabled={busy}
              onPress={() => {
                setConfirming(false);
                onRemove();
              }}
            />
          </View>
        </View>
      ) : (
        <View className="flex-row justify-end border-t border-border pt-1.5">
          {removable ? (
            <TextButton
              label={t('onboarding.partners.remove')}
              accessibilityLabel={t('onboarding.partners.removeLabel', { name })}
              disabled={busy}
              onPress={() => {
                stepFeedback();
                setConfirming(true);
              }}
            />
          ) : null}
          <TextButton
            tone="primary"
            label={t('onboarding.partners.edit')}
            accessibilityLabel={t('onboarding.partners.editLabel', { name })}
            disabled={busy}
            onPress={() => router.push(partnerRoute(partner.id))}
          />
        </View>
      )}
    </Card>
  );
}

function Partners({ data }: { data: OnboardingData }) {
  const { t } = useTranslation();
  const store = useOnboardingStore();
  const { failure, retry } = usePartners('propose');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { partners } = data;

  /** Runs a change on the server; a failure is shown above the main button. */
  async function run(action: () => Promise<void>) {
    setProblem(null);
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setProblem(t(apiErrorKey(apiErrorCode(error))));
    } finally {
      setBusy(false);
    }
  }

  const title = (
    <Reveal>
      <View className="gap-2.5">
        <Text variant="title" accessibilityRole="header">
          {t('onboarding.partners.title')}
        </Text>
        <Text tone="muted">{t('onboarding.partners.body')}</Text>
      </View>
    </Reveal>
  );

  if (!partners) {
    return (
      <StepLayout header={HEADER}>
        {title}
        <LoadState
          failed={failure !== null}
          loadingLabel={t('onboarding.partners.loading')}
          slowLabel={t('onboarding.partners.loadingSlow')}
          failedLabel={t(
            failure === 'network' ? 'errors.network' : 'onboarding.partners.loadFailed',
          )}
          retryLabel={t('onboarding.retry')}
          onRetry={retry}
        />
      </StepLayout>
    );
  }

  return (
    <StepLayout
      header={HEADER}
      actions={
        <>
          {problem ? (
            <View className="pb-2">
              <NoticeBox icon="alert" tone="danger">
                {problem}
              </NoticeBox>
            </View>
          ) : null}
          <Button
            label={t('common.continue')}
            loading={busy}
            disabled={partners.length === 0}
            onPress={() => {
              commitFeedback();
              void run(async () => {
                await store.confirmPartners();
                router.replace(ROUTES.onboardingReady);
              });
            }}
          />
        </>
      }
    >
      {title}
      <View className="gap-3">
        {partners.map((partner, i) => (
          <Reveal key={partner.id} delay={staggerDelay(i + 1)}>
            <PartnerCard
              partner={partner}
              removable={partners.length > 1}
              busy={busy}
              onRemove={() => void run(() => store.removePartner(partner.id))}
            />
          </Reveal>
        ))}
      </View>
    </StepLayout>
  );
}

/**
 * 4.7 Starter partners: the two or three personas proposed for the learner's goals (spec
 * §6.1.1 step 5). Each can be kept, removed, renamed or given another look; at least one stays.
 */
export function PartnersScreen() {
  return (
    <StageGate allowed={(status) => status.stage === 'partners'} header={HEADER}>
      {(data) => <Partners data={data} />}
    </StageGate>
  );
}
