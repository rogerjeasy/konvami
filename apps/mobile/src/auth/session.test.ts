import * as SecureStore from 'expo-secure-store';
import { createFakeAuthProvider } from '@/test/fake-auth-provider';
import { createSessionStore } from './session';
import { loadSavedSession, saveSession } from './token-store';

const EMAIL = 'amara@mail.com';
const PASSWORD = 'Sommer2026!';

function setup() {
  const provider = createFakeAuthProvider();
  provider.addAccount(EMAIL, PASSWORD);
  return { provider, session: createSessionStore(provider) };
}

beforeEach(() => {
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

describe('restore at launch', () => {
  it('starts as loading and becomes signed out when nothing is saved', async () => {
    const { session } = setup();
    expect(session.getState()).toEqual({ status: 'loading', user: null });
    await session.restore();
    expect(session.getState()).toEqual({ status: 'signedOut', user: null });
  });

  it('signs the user back in from the saved refresh token, with the latest account data', async () => {
    const { provider, session } = setup();
    await session.signIn(EMAIL, PASSWORD);
    await session.saveAiConsent({ elevenlabs: true, bedrock: false });

    const afterRestart = createSessionStore(provider);
    await afterRestart.restore();

    const state = afterRestart.getState();
    expect(state.status).toBe('signedIn');
    expect(state.user?.email).toBe(EMAIL);
    expect(state.user?.aiConsent?.providers.bedrock).toBe(false);
  });

  it('signs out and forgets the saved session when the refresh token no longer works', async () => {
    const { provider, session } = setup();
    await saveSession({
      refreshToken: 'revoked',
      user: { email: EMAIL, firstName: 'Amara', aiConsent: null },
    });
    await session.restore();

    expect(session.getState().status).toBe('signedOut');
    expect(await loadSavedSession()).toBeNull();
    expect(provider.calls[0]).toEqual(['refresh', 'revoked']);
  });

  it('keeps the user signed in from the saved copy when there is no connection', async () => {
    const { provider, session } = setup();
    await session.signIn(EMAIL, PASSWORD);

    const offline = createSessionStore(provider);
    provider.failNext('refresh', 'network');
    await offline.restore();

    expect(offline.getState()).toMatchObject({ status: 'signedIn', user: { email: EMAIL } });
    expect(await loadSavedSession()).not.toBeNull();
  });

  it('keeps the user signed in when the server has a temporary problem', async () => {
    const { provider, session } = setup();
    await session.signIn(EMAIL, PASSWORD);

    const later = createSessionStore(provider);
    provider.failNext('refresh', 'unknown');
    await later.restore();

    expect(later.getState().status).toBe('signedIn');
    expect(await loadSavedSession()).not.toBeNull();
  });
});

describe('signIn', () => {
  it('signs in, loads the user and saves the session for the next launch', async () => {
    const { session } = setup();
    await session.signIn(EMAIL, PASSWORD);

    expect(session.getState()).toMatchObject({
      status: 'signedIn',
      user: { email: EMAIL, firstName: 'Amara', aiConsent: null },
    });
    expect((await loadSavedSession())?.user.email).toBe(EMAIL);
  });

  it('stays signed out and saves nothing when the password is wrong', async () => {
    const { session } = setup();
    await session.restore();
    await expect(session.signIn(EMAIL, 'wrong')).rejects.toMatchObject({ code: 'notAuthorized' });

    expect(session.getState().status).toBe('signedOut');
    expect(await loadSavedSession()).toBeNull();
  });

  it('tells subscribers when the state changes, and stops after they unsubscribe', async () => {
    const { session } = setup();
    const listener = jest.fn();
    const unsubscribe = session.subscribe(listener);
    await session.signIn(EMAIL, PASSWORD);
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    unsubscribe();
    await session.signOut();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('saveAiConsent', () => {
  it('stores the choices on the account and on the signed-in user', async () => {
    const { session } = setup();
    await session.signIn(EMAIL, PASSWORD);
    await session.saveAiConsent({ elevenlabs: false, bedrock: true });

    expect(session.getState().user?.aiConsent?.providers).toEqual({
      openai: true,
      elevenlabs: false,
      bedrock: true,
    });
    expect((await loadSavedSession())?.user.aiConsent).not.toBeNull();
  });

  it('gets a new access token first when the session was restored offline', async () => {
    const { provider, session } = setup();
    await session.signIn(EMAIL, PASSWORD);
    const offline = createSessionStore(provider);
    provider.failNext('refresh', 'network');
    await offline.restore();

    await offline.saveAiConsent({ elevenlabs: true, bedrock: true });
    expect(offline.getState().user?.aiConsent).not.toBeNull();
  });

  it('gets a new access token first when the current one has expired', async () => {
    const { provider, session } = setup();
    await session.signIn(EMAIL, PASSWORD);
    const before = provider.calls.filter(([method]) => method === 'refresh').length;

    jest.useFakeTimers().setSystemTime(Date.now() + 2 * 3600 * 1000);
    await session.saveAiConsent({ elevenlabs: true, bedrock: true });
    jest.useRealTimers();

    expect(provider.calls.filter(([method]) => method === 'refresh').length).toBe(before + 1);
  });

  it('fails as "notAuthorized" when nobody is signed in', async () => {
    const { session } = setup();
    await session.restore();
    await expect(session.saveAiConsent({ elevenlabs: true, bedrock: true })).rejects.toMatchObject({
      code: 'notAuthorized',
    });
  });
});

describe('signOut', () => {
  it('revokes the refresh token, forgets the saved session and becomes signed out', async () => {
    const { provider, session } = setup();
    await session.signIn(EMAIL, PASSWORD);
    await session.signOut();

    expect(session.getState()).toEqual({ status: 'signedOut', user: null });
    expect(await loadSavedSession()).toBeNull();
    expect(provider.liveRefreshTokens.size).toBe(0);
  });

  it('still signs out on the device when the server cannot be reached', async () => {
    const { provider, session } = setup();
    await session.signIn(EMAIL, PASSWORD);
    provider.failNext('signOut', 'network');
    await session.signOut();

    expect(session.getState().status).toBe('signedOut');
    expect(await loadSavedSession()).toBeNull();
  });
});

describe('resetPassword', () => {
  const NEW_PASSWORD = 'Bergsee!Wandern42';
  const reset = { email: EMAIL, code: '482915', newPassword: NEW_PASSWORD };

  it('sets the new password and signs the user in on this device', async () => {
    const { provider, session } = setup();
    await session.restore();
    await session.resetPassword({ ...reset, signOutOthers: false });

    expect(session.getState()).toMatchObject({ status: 'signedIn', user: { email: EMAIL } });
    expect((await loadSavedSession())?.user.email).toBe(EMAIL);
    await expect(provider.signIn(EMAIL, PASSWORD)).rejects.toMatchObject({ code: 'notAuthorized' });
  });

  it('signs out every other device when asked, and keeps this one signed in', async () => {
    const { provider, session } = setup();
    const otherDevice = await provider.signIn(EMAIL, PASSWORD);
    await session.restore();
    await session.resetPassword({ ...reset, signOutOthers: true });

    await expect(provider.refresh(otherDevice.refreshToken)).rejects.toMatchObject({
      code: 'notAuthorized',
    });
    // This device still has a working session: it can change the account.
    await session.saveAiConsent({ elevenlabs: true, bedrock: true });
    expect(session.getState().user?.aiConsent).not.toBeNull();
    const saved = await loadSavedSession();
    await expect(provider.refresh(saved?.refreshToken ?? '')).resolves.toBeTruthy();
  });

  it('leaves other devices signed in when not asked to sign them out', async () => {
    const { provider, session } = setup();
    const otherDevice = await provider.signIn(EMAIL, PASSWORD);
    await session.restore();
    await session.resetPassword({ ...reset, signOutOthers: false });
    await expect(provider.refresh(otherDevice.refreshToken)).resolves.toBeTruthy();
  });

  it('stays signed out and changes nothing when the code is wrong', async () => {
    const { provider, session } = setup();
    await session.restore();
    await expect(
      session.resetPassword({ ...reset, code: '000000', signOutOthers: true }),
    ).rejects.toMatchObject({ code: 'invalidCode' });

    expect(session.getState().status).toBe('signedOut');
    await expect(provider.signIn(EMAIL, PASSWORD)).resolves.toBeTruthy();
  });

  it('refuses a password the account already used', async () => {
    const { session } = setup();
    await session.restore();
    await expect(
      session.resetPassword({ ...reset, newPassword: PASSWORD, signOutOthers: false }),
    ).rejects.toMatchObject({ code: 'passwordReused' });
    expect(session.getState().status).toBe('signedOut');
  });
});

describe('access token for API calls', () => {
  it('gives a signed-in user a token the service accepts', async () => {
    const { provider, session } = setup();
    await session.signIn(EMAIL, PASSWORD);

    const token = await session.getAccessToken();

    expect((await provider.getUser(token)).email).toBe(EMAIL);
  });

  it('renews a token that is about to expire', async () => {
    const { provider, session } = setup();
    await session.signIn(EMAIL, PASSWORD);
    const first = await session.getAccessToken();
    const now = Date.now();
    // The fake's tokens last an hour; 59 minutes 30 seconds later is inside the renewal margin.
    jest.spyOn(Date, 'now').mockReturnValue(now + 59.5 * 60 * 1000);

    const second = await session.getAccessToken();

    expect(second).not.toBe(first);
    expect(provider.calls.at(-1)?.[0]).toBe('refresh');
    jest.restoreAllMocks();
  });

  it('refuses when nobody is signed in', async () => {
    const { session } = setup();
    await session.restore();

    await expect(session.getAccessToken()).rejects.toMatchObject({ code: 'notAuthorized' });
  });
});
