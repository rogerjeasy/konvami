import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
import '@/i18n';
import { AuthServicesProvider, type AuthServices } from '@/auth/services';
import { createSessionStore } from '@/auth/session';
import { SignUpDraftProvider, type SignUpDraft } from '@/screens/create-account/draft';
import { AccessDraftProvider, type AccessDraft } from '@/screens/sign-in/draft';
import { createFakeAuthProvider, type FakeAuthProvider } from '@/test/fake-auth-provider';
import { ThemeProvider } from '@/theme';

/** Auth for a test: an in-memory provider and a session store on top of it, already "restored". */
export async function createTestAuth(): Promise<AuthServices & { provider: FakeAuthProvider }> {
  const provider = createFakeAuthProvider();
  const session = createSessionStore(provider);
  await session.restore();
  return { provider, session };
}

/**
 * Renders a screen the way the app does: inside the theme, with i18n loaded, auth services and
 * the flow drafts. Pass `auth` to prepare accounts or inspect calls, and `draft` (sign-up) or
 * `access` (sign-in and password reset) to start mid-flow.
 */
export async function renderScreen(
  ui: ReactElement,
  {
    auth,
    draft,
    access,
  }: { auth?: AuthServices; draft?: Partial<SignUpDraft>; access?: Partial<AccessDraft> } = {},
) {
  const services = auth ?? (await createTestAuth());
  return render(
    <ThemeProvider>
      <AuthServicesProvider services={services}>
        <SignUpDraftProvider initial={draft}>
          <AccessDraftProvider initial={access}>{ui}</AccessDraftProvider>
        </SignUpDraftProvider>
      </AuthServicesProvider>
    </ThemeProvider>,
  );
}
