import * as SecureStore from 'expo-secure-store';
import { clearSavedSession, loadSavedSession, saveSession } from './token-store';

const user = { email: 'amara@mail.com', firstName: 'Amara', aiConsent: null };

beforeEach(() => {
  (SecureStore as unknown as { __reset: () => void }).__reset();
  jest.clearAllMocks();
});

describe('saved session', () => {
  it('is empty on a fresh install', async () => {
    expect(await loadSavedSession()).toBeNull();
  });

  it('gives back the refresh token and user it saved', async () => {
    await saveSession({ refreshToken: 'refresh-1', user });
    expect(await loadSavedSession()).toEqual({ refreshToken: 'refresh-1', user });
  });

  it('keeps a token larger than the Keychain accepts in one item', async () => {
    const long = 'r'.repeat(5000);
    await saveSession({ refreshToken: long, user });

    const written = jest
      .mocked(SecureStore.setItemAsync)
      .mock.calls.map(([, value]) => value.length);
    expect(Math.max(...written)).toBeLessThanOrEqual(1800);
    expect((await loadSavedSession())?.refreshToken).toBe(long);
  });

  it('leaves nothing of a long token behind when a short one replaces it', async () => {
    await saveSession({ refreshToken: 'r'.repeat(5000), user });
    await saveSession({ refreshToken: 'short', user });
    expect((await loadSavedSession())?.refreshToken).toBe('short');
  });

  it('is empty again after it is cleared', async () => {
    await saveSession({ refreshToken: 'r'.repeat(5000), user });
    await clearSavedSession();
    expect(await loadSavedSession()).toBeNull();
    expect(jest.mocked(SecureStore.deleteItemAsync).mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('treats unreadable saved data as no session', async () => {
    await SecureStore.setItemAsync('konvami.auth.session.count', '1');
    await SecureStore.setItemAsync('konvami.auth.session.0', '{not json');
    expect(await loadSavedSession()).toBeNull();
  });

  it('treats a session with a missing part as no session', async () => {
    await saveSession({ refreshToken: 'r'.repeat(5000), user });
    await SecureStore.deleteItemAsync('konvami.auth.session.1');
    expect(await loadSavedSession()).toBeNull();
  });
});
