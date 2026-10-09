import { routeForSession } from './routing';
import type { User } from './types';

const user: User = { email: 'amara@mail.com', firstName: 'Amara', aiConsent: null };
const consent = {
  version: 'v1',
  at: '2026-10-09T12:30:00.000Z',
  providers: { openai: true, elevenlabs: true, bedrock: true },
} as const;

describe('routeForSession', () => {
  it('starts account creation for someone who is not signed in', () => {
    expect(routeForSession({ status: 'signedOut', user: null })).toBe('/age-check');
  });

  it('resumes at AI consent for a signed-in user who has not agreed yet', () => {
    expect(routeForSession({ status: 'signedIn', user })).toBe('/ai-consent');
  });

  it('goes into the app for a signed-in user who has agreed', () => {
    expect(routeForSession({ status: 'signedIn', user: { ...user, aiConsent: consent } })).toBe(
      '/home',
    );
  });
});
