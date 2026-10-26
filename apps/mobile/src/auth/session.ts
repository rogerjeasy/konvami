import type { Language } from '@/i18n/languages';
import { clearSavedSession, loadSavedSession, saveSession } from './token-store';
import {
  AuthError,
  type AiConsentChoices,
  type AuthProvider,
  type Tokens,
  type User,
} from './types';

// How long a task before a sign-out may hold it up (a request that cannot get through).
const SIGN_OUT_TASK_MS = 3000;

/**
 * Who is signed in on this device. One store for the whole app: it restores the saved session at
 * launch, keeps a working access token, and is the only code that writes the saved session.
 */
export interface SessionState {
  /** `loading` only until `restore()` has finished at launch. */
  status: 'loading' | 'signedOut' | 'signedIn';
  user: User | null;
}

export interface SessionStore {
  getState(): SessionState;
  subscribe(listener: () => void): () => void;
  /** Reads the saved session at launch. Never throws: any failure ends as signed in or out. */
  restore(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  saveAiConsent(choices: AiConsentChoices): Promise<void>;
  /**
   * Finishes a password reset with the emailed code and signs the user in here. With
   * `signOutOthers`, every other device is signed out (this one keeps a fresh session).
   */
  resetPassword(input: {
    email: string;
    code: string;
    newPassword: string;
    signOutOthers: boolean;
  }): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Runs `task` before each sign-out on this device, while the account can still be reached (the
   * app stops push to this phone). A task that fails, or takes longer than a few seconds, does not
   * hold the sign-out up. Returns the way to stop.
   */
  beforeSignOut(task: () => Promise<void>): () => void;
  /**
   * Ends every session of the account, on every device, and signs out here. Unlike `signOut`
   * it rejects when the server could not be told: the user stays signed in and can try again.
   */
  signOutEverywhere(): Promise<void>;
  updateName(firstName: string): Promise<void>;
  /** Stores the app language on the account, for the setup guide and for emails. */
  updateLanguage(language: Language): Promise<void>;
  /** Fails with `notAuthorized` when `current` is wrong. The user stays signed in. */
  changePassword(current: string, next: string): Promise<void>;
  /** Sends a code to the new address; the account keeps its email until it is confirmed. */
  requestEmailChange(email: string): Promise<void>;
  confirmEmailChange(code: string): Promise<void>;
  /**
   * Signs the user in again with their password, before something that cannot be undone: the
   * server only does it for a token from a sign-in made moments ago. The app continues on the
   * new session and the old one is closed. Fails with `notAuthorized` for a wrong password and
   * then keeps the session as it was.
   */
  reauthenticate(password: string): Promise<void>;
  /** Signs out on this device only, without telling the server (the account no longer exists). */
  forget(): Promise<void>;
  /**
   * A working access token for calls to the Konvami API, renewed when needed. Fails with
   * `notAuthorized` when nobody is signed in.
   */
  getAccessToken(): Promise<string>;
}

// An access token this close to its end (ms) is renewed before use, so a call never starts with
// a token that expires on the way.
const EXPIRY_MARGIN_MS = 60 * 1000;

const SIGNED_OUT: SessionState = { status: 'signedOut', user: null };

export function createSessionStore(provider: AuthProvider): SessionStore {
  let state: SessionState = { status: 'loading', user: null };
  /** The refresh token is known whenever someone is signed in; the access token may be missing. */
  let refreshToken: string | null = null;
  let tokens: Tokens | null = null;
  const listeners = new Set<() => void>();

  function setState(next: SessionState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  async function signedIn(user: User) {
    setState({ status: 'signedIn', user });
    if (refreshToken) await saveSession({ refreshToken, user });
  }

  async function forget() {
    refreshToken = null;
    tokens = null;
    await clearSavedSession();
    setState(SIGNED_OUT);
  }

  /** A working access token, renewed when it is missing (offline restore) or about to expire. */
  async function accessToken(): Promise<string> {
    if (!refreshToken) throw new AuthError('notAuthorized');
    if (!tokens || tokens.expiresAt - Date.now() < EXPIRY_MARGIN_MS) {
      tokens = await provider.refresh(refreshToken);
      refreshToken = tokens.refreshToken;
    }
    return tokens.accessToken;
  }

  const signingOut = new Set<() => Promise<void>>();

  /** One task before a sign-out, given a few seconds at most. */
  async function inTime(task: () => Promise<void>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const giveUp = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SIGN_OUT_TASK_MS);
    });
    try {
      await Promise.race([task().catch(() => {}), giveUp]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function beforeSigningOut() {
    await Promise.all([...signingOut].map(inTime));
  }

  async function signIn(email: string, password: string) {
    const next = await provider.signIn(email, password);
    const user = await provider.getUser(next.accessToken);
    tokens = next;
    refreshToken = next.refreshToken;
    await signedIn(user);
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async restore() {
      const saved = await loadSavedSession();
      if (!saved) {
        setState(SIGNED_OUT);
        return;
      }
      refreshToken = saved.refreshToken;
      try {
        await signedIn(await provider.getUser(await accessToken()));
      } catch (error) {
        // Only a refused refresh token (revoked or expired) ends the session. Offline or a
        // server hiccup keeps the user in on the saved copy; tokens are fetched when needed.
        if (error instanceof AuthError && error.code === 'notAuthorized') {
          await forget();
        } else {
          setState({ status: 'signedIn', user: saved.user });
        }
      }
    },

    signIn,
    getAccessToken: accessToken,

    async resetPassword({ email, code, newPassword, signOutOthers }) {
      await provider.confirmPasswordReset(email, code, newPassword);
      if (signOutOthers) {
        // "Everywhere" ends every session of the account, so a short-lived one is opened just to
        // make that call; the sign-in below then gives this device its own fresh session.
        const temporary = await provider.signIn(email, newPassword);
        await provider.signOutEverywhere(temporary.accessToken);
      }
      await signIn(email, newPassword);
    },

    async saveAiConsent(choices) {
      const aiConsent = await provider.saveAiConsent(await accessToken(), choices);
      if (state.user) await signedIn({ ...state.user, aiConsent });
    },

    beforeSignOut(task) {
      signingOut.add(task);
      return () => void signingOut.delete(task);
    },

    async signOut() {
      await beforeSigningOut();
      const token = refreshToken;
      // The device signs out even when the server cannot be told; the token then simply expires.
      if (token) await provider.signOut(token).catch(() => {});
      await forget();
    },

    async signOutEverywhere() {
      await beforeSigningOut();
      await provider.signOutEverywhere(await accessToken());
      await forget();
    },

    async updateName(firstName) {
      const name = firstName.trim();
      await provider.updateName(await accessToken(), name);
      if (state.user) await signedIn({ ...state.user, firstName: name });
    },

    async updateLanguage(language) {
      await provider.updateLocale(await accessToken(), language);
    },

    async changePassword(current, next) {
      await provider.changePassword(await accessToken(), current, next);
    },

    async requestEmailChange(email) {
      await provider.requestEmailChange(await accessToken(), email);
    },

    async confirmEmailChange(code) {
      const token = await accessToken();
      await provider.confirmEmailChange(token, code);
      // The account knows the address as it stored it; read it rather than assume it.
      await signedIn(await provider.getUser(token));
    },

    async reauthenticate(password) {
      const user = state.user;
      if (!user) throw new AuthError('notAuthorized');
      const fresh = await provider.signIn(user.email, password);
      const replaced = refreshToken;
      tokens = fresh;
      refreshToken = fresh.refreshToken;
      await signedIn(user);
      // One session per device: the one this sign-in replaces is closed on the server.
      if (replaced && replaced !== fresh.refreshToken) {
        await provider.signOut(replaced).catch(() => {});
      }
    },

    forget,
  };
}
