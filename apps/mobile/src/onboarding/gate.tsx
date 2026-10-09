import { useEffect, useState, type ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { LoadState } from '@/components/load-state';
import { StepLayout } from '@/components/step-layout';
import type { Onboarding } from '@konvami/api-client';
import { ROUTES } from '@/lib/routes';
import { routeForOnboarding } from './routing';
import { useOnboarding, useOnboardingStore } from './services';
import type { OnboardingData } from './store';

/**
 * Loads the onboarding data for a screen and shows the screen once it is there. Until then the
 * screen's header stays, with a loading note or, after a failure, a way to try again. Someone who
 * is not signed in is sent to the start: the profile belongs to an account.
 */
export function OnboardingGate({
  header,
  children,
}: {
  /** The screen's top row, shown while loading too, so the way back is never missing. */
  header: ReactNode;
  children: (data: OnboardingData) => ReactNode;
}) {
  const { t } = useTranslation();
  const { status } = useSession();
  const store = useOnboardingStore();
  const state = useOnboarding();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  if (state.phase === 'ready') return <>{children(state.data)}</>;
  return (
    <StepLayout header={header}>
      <LoadState
        failed={state.phase === 'failed'}
        loadingLabel={t('onboarding.loading')}
        slowLabel={t('onboarding.loadingSlow')}
        failedLabel={t(state.error === 'network' ? 'errors.network' : 'onboarding.loadFailed')}
        retryLabel={t('onboarding.retry')}
        onRetry={() => void store.reload()}
      />
    </StepLayout>
  );
}

function Admission({
  data,
  allowed,
  children,
}: {
  data: OnboardingData;
  allowed: (status: Onboarding) => boolean;
  children: (data: OnboardingData) => ReactNode;
}) {
  // Decided once, on arrival: the screen's own actions move the stage on and navigate themselves.
  const [admitted] = useState(() => allowed(data.status));
  if (!admitted) return <Redirect href={routeForOnboarding(data.status) ?? ROUTES.home} />;
  return <>{children(data)}</>;
}

/**
 * An `OnboardingGate` for a screen that belongs to one part of onboarding: a learner who arrives
 * there from somewhere else (an old link, the back button) is sent to where they really are.
 */
export function StageGate({
  allowed,
  header,
  children,
}: {
  allowed: (status: Onboarding) => boolean;
  header: ReactNode;
  children: (data: OnboardingData) => ReactNode;
}) {
  return (
    <OnboardingGate header={header}>
      {(data) => (
        <Admission data={data} allowed={allowed}>
          {children}
        </Admission>
      )}
    </OnboardingGate>
  );
}
