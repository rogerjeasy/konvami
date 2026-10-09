import { ROUTES } from '@/lib/routes';
import type { SessionState } from './session';

/**
 * Where "Get started" and the app launch lead for the current session: a signed-in user never
 * repeats sign-up, and one who left before agreeing to the AI consent resumes exactly there.
 */
export function routeForSession(state: SessionState) {
  if (state.status !== 'signedIn' || !state.user) return ROUTES.createAccount;
  return state.user.aiConsent ? ROUTES.home : ROUTES.aiConsent;
}
