import {
  AuthError,
  type AiConsent,
  type AuthErrorCode,
  type AuthProvider,
  type User,
} from '@/auth/types';

/**
 * An in-memory `AuthProvider` for tests: accounts live in a map, the verification code is always
 * `FAKE_CODE`, and `failNext` makes the next call to one method fail with a given code.
 */
export const FAKE_CODE = '482915';

interface Account {
  password: string;
  confirmed: boolean;
  user: User;
}

export interface FakeAuthProvider extends AuthProvider {
  /** Makes the next call of `method` reject with `code`. */
  failNext(method: keyof AuthProvider, code: AuthErrorCode): void;
  /** Every call so far, as `[method, ...arguments]`, in order. */
  readonly calls: readonly unknown[][];
  /** Adds a verified account directly, as if it had signed up earlier. */
  addAccount(email: string, password: string, user?: Partial<User>): void;
  /** Tokens handed out so far that have not been revoked. */
  readonly liveRefreshTokens: ReadonlySet<string>;
}

export function createFakeAuthProvider(): FakeAuthProvider {
  const accounts = new Map<string, Account>();
  const refreshTokens = new Map<string, string>();
  const accessTokens = new Map<string, string>();
  const failures = new Map<keyof AuthProvider, AuthErrorCode>();
  const calls: unknown[][] = [];
  let counter = 0;

  function record(method: keyof AuthProvider, ...args: unknown[]) {
    calls.push([method, ...args]);
    const failure = failures.get(method);
    if (failure) {
      failures.delete(method);
      throw new AuthError(failure);
    }
  }

  function issue(email: string, refreshToken?: string) {
    counter += 1;
    const accessToken = `access-${counter}`;
    const refresh = refreshToken ?? `refresh-${counter}`;
    accessTokens.set(accessToken, email);
    refreshTokens.set(refresh, email);
    return { accessToken, refreshToken: refresh, expiresAt: Date.now() + 3600 * 1000 };
  }

  function accountFor(accessToken: string): Account {
    const account = accounts.get(accessTokens.get(accessToken) ?? '');
    if (!account) throw new AuthError('notAuthorized');
    return account;
  }

  return {
    calls,
    get liveRefreshTokens() {
      return new Set(refreshTokens.keys());
    },
    failNext: (method, code) => void failures.set(method, code),
    addAccount(email, password, user = {}) {
      accounts.set(email, {
        password,
        confirmed: true,
        user: { email, firstName: 'Amara', aiConsent: null, ...user },
      });
    },

    async signUp(input) {
      record('signUp', input);
      const email = input.email.trim().toLowerCase();
      if (accounts.get(email)?.confirmed) throw new AuthError('emailTaken');
      accounts.set(email, {
        password: input.password,
        confirmed: false,
        user: { email, firstName: input.firstName.trim(), aiConsent: null },
      });
    },
    async confirmSignUp(email, code) {
      record('confirmSignUp', email, code);
      const account = accounts.get(email);
      if (!account || code !== FAKE_CODE) throw new AuthError('invalidCode');
      account.confirmed = true;
    },
    async resendCode(email) {
      record('resendCode', email);
    },
    async signIn(email, password) {
      record('signIn', email, password);
      const account = accounts.get(email);
      if (!account || account.password !== password) throw new AuthError('notAuthorized');
      if (!account.confirmed) throw new AuthError('notConfirmed');
      return issue(email);
    },
    async refresh(refreshToken) {
      record('refresh', refreshToken);
      const email = refreshTokens.get(refreshToken);
      if (!email) throw new AuthError('notAuthorized');
      return issue(email, refreshToken);
    },
    async getUser(accessToken) {
      record('getUser', accessToken);
      return { ...accountFor(accessToken).user };
    },
    async saveAiConsent(accessToken, choices) {
      record('saveAiConsent', accessToken, choices);
      const consent: AiConsent = {
        version: 'v1',
        at: new Date().toISOString(),
        providers: { openai: true, ...choices },
      };
      accountFor(accessToken).user.aiConsent = consent;
      return consent;
    },
    async signOut(refreshToken) {
      record('signOut', refreshToken);
      refreshTokens.delete(refreshToken);
    },
    async requestPasswordReset(email) {
      record('requestPasswordReset', email);
    },
    async confirmPasswordReset(email, code, newPassword) {
      record('confirmPasswordReset', email, code, newPassword);
      const account = accounts.get(email);
      if (!account || code !== FAKE_CODE) throw new AuthError('invalidCode');
      if (account.password === newPassword) throw new AuthError('passwordReused');
      account.password = newPassword;
    },
    async signOutEverywhere(accessToken) {
      record('signOutEverywhere', accessToken);
      const email = accessTokens.get(accessToken);
      if (!email) throw new AuthError('notAuthorized');
      for (const [token, owner] of refreshTokens) if (owner === email) refreshTokens.delete(token);
    },
  };
}
