import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
import '@/i18n';
import { AuthServicesProvider, type AuthServices } from '@/auth/services';
import { createSessionStore } from '@/auth/session';
import { SignUpDraftProvider, type SignUpDraft } from '@/screens/create-account/draft';
import { AccessDraftProvider, type AccessDraft } from '@/screens/sign-in/draft';
import { createFakeAuthProvider, type FakeAuthProvider } from '@/test/fake-auth-provider';
import { OnboardingProvider } from '@/onboarding/services';
import { createOnboardingStore } from '@/onboarding/store';
import { createPracticeServices, PracticeProvider } from '@/practice/services';
import { createFakeApi, FAKE_NOW, type FakeApi } from '@/test/fake-api';
import { createFakeVoiceEngine, type FakeVoiceEngine } from '@/test/fake-voice-engine';
import { ThemeProvider } from '@/theme';
import { VoiceProvider } from '@/voice/services';

const TEST_ACCOUNT = { email: 'amara.diallo@mail.com', password: 'Sommer2026!' };

/** Auth for a test: an in-memory provider and a session store on top of it, already "restored". */
export async function createTestAuth(): Promise<AuthServices & { provider: FakeAuthProvider }> {
  const provider = createFakeAuthProvider();
  const session = createSessionStore(provider);
  await session.restore();
  return { provider, session };
}

/**
 * Renders a screen the way the app does: inside the theme, with i18n loaded, auth services, the
 * flow drafts and the onboarding store. Pass `auth` to prepare accounts or inspect calls, `draft`
 * (sign-up) or `access` (sign-in and password reset) to start mid-flow, `api` to prepare or
 * inspect what the backend holds, `voice` to play a live call, `now` to set the device's clock
 * (it stands at the fake server's time otherwise), and `signedIn` to start as a signed-in
 * learner (Amara).
 */
export async function renderScreen(
  ui: ReactElement,
  {
    auth,
    draft,
    access,
    api,
    voice,
    now,
    signedIn = false,
  }: {
    auth?: AuthServices;
    draft?: Partial<SignUpDraft>;
    access?: Partial<AccessDraft>;
    api?: FakeApi;
    voice?: FakeVoiceEngine;
    /** The device's clock: a fixed moment, or a function for a clock that a test moves. */
    now?: Date | (() => number);
    signedIn?: boolean;
  } = {},
) {
  const services = auth ?? (await createTestAuth());
  if (signedIn) {
    const fake = services.provider as FakeAuthProvider;
    fake.addAccount(TEST_ACCOUNT.email, TEST_ACCOUNT.password);
    await services.session.signIn(TEST_ACCOUNT.email, TEST_ACCOUNT.password);
  }
  const backend = api ?? createFakeApi();
  const onboarding = createOnboardingStore(backend);
  const moment = now ?? new Date(FAKE_NOW);
  const practice = createPracticeServices(backend, {
    timeZone: () => 'Europe/Zurich',
    now: typeof moment === 'function' ? moment : () => moment.getTime(),
  });
  const engine = voice ?? createFakeVoiceEngine();
  return render(
    <ThemeProvider>
      <AuthServicesProvider services={services}>
        <OnboardingProvider store={onboarding}>
          <PracticeProvider services={practice}>
            <VoiceProvider
              createEngine={(purpose, personaId) => {
                engine.openedFor.push(purpose);
                engine.openedWith.push(personaId);
                return engine;
              }}
            >
              <SignUpDraftProvider initial={draft}>
                <AccessDraftProvider initial={access}>{ui}</AccessDraftProvider>
              </SignUpDraftProvider>
            </VoiceProvider>
          </PracticeProvider>
        </OnboardingProvider>
      </AuthServicesProvider>
    </ThemeProvider>,
  );
}
