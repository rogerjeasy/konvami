import type { CognitoCall } from './cognito-client';
import { AI_CONSENT_VERSION, decodeAiConsent, encodeAiConsent, encodeTipsOptIn } from './consent';
import { AuthError, type AuthProvider, type Tokens, type User } from './types';

/** Account attributes the app reads and writes; the same names as in infra/modules/auth. */
const ATTRIBUTE = {
  email: 'email',
  firstName: 'given_name',
  locale: 'locale',
  ageBracket: 'custom:age_bracket',
  tipsOptIn: 'custom:tips_optin',
  aiConsent: 'custom:ai_consent',
} as const;

interface AuthenticationResult {
  AccessToken?: string;
  RefreshToken?: string;
  /** Lifetime of the access token, in seconds. */
  ExpiresIn?: number;
}

/** Emails are the sign-in name: compared without surrounding spaces or letter case. */
const normalise = (email: string) => email.trim().toLowerCase();

/** `AuthProvider` on an Amazon Cognito user pool with a public app client (no client secret). */
export function createCognitoProvider({
  clientId,
  call,
  now = () => new Date(),
}: {
  clientId: string;
  call: CognitoCall;
  now?: () => Date;
}): AuthProvider {
  async function authenticate(
    flow: 'USER_PASSWORD_AUTH' | 'REFRESH_TOKEN_AUTH',
    parameters: Record<string, string>,
    currentRefreshToken?: string,
  ): Promise<Tokens> {
    const { AuthenticationResult: result } = await call<{
      AuthenticationResult?: AuthenticationResult;
    }>('InitiateAuth', { AuthFlow: flow, ClientId: clientId, AuthParameters: parameters });
    // A refresh usually returns no new refresh token: the current one stays valid.
    const refreshToken = result?.RefreshToken ?? currentRefreshToken;
    // No tokens means Cognito asked for a further step (MFA, new password) the app has no screen for.
    if (!result?.AccessToken || !refreshToken) throw new AuthError('unknown');
    return {
      accessToken: result.AccessToken,
      refreshToken,
      expiresAt: now().getTime() + (result.ExpiresIn ?? 0) * 1000,
    };
  }

  const resendCode = async (email: string) => {
    await call('ResendConfirmationCode', { ClientId: clientId, Username: normalise(email) });
  };

  return {
    async signUp({ email, password, firstName, locale, ageBracket, tipsOptIn }) {
      const username = normalise(email);
      try {
        await call('SignUp', {
          ClientId: clientId,
          Username: username,
          Password: password,
          UserAttributes: [
            { Name: ATTRIBUTE.email, Value: username },
            { Name: ATTRIBUTE.firstName, Value: firstName.trim() },
            { Name: ATTRIBUTE.locale, Value: locale },
            { Name: ATTRIBUTE.ageBracket, Value: ageBracket },
            { Name: ATTRIBUTE.tipsOptIn, Value: encodeTipsOptIn(tipsOptIn, now()) },
          ],
        });
      } catch (error) {
        if (!(error instanceof AuthError) || error.code !== 'emailTaken') throw error;
        // The email exists. If that sign-up was never verified, a new code lets the user finish
        // it; a verified account refuses the resend, and only then is the email really taken.
        try {
          await resendCode(username);
        } catch (resendError) {
          const verified =
            resendError instanceof AuthError && resendError.code === 'alreadyConfirmed';
          throw verified ? new AuthError('emailTaken') : resendError;
        }
      }
    },

    async confirmSignUp(email, code) {
      await call('ConfirmSignUp', {
        ClientId: clientId,
        Username: normalise(email),
        ConfirmationCode: code,
      });
    },

    resendCode,

    signIn: (email, password) =>
      authenticate('USER_PASSWORD_AUTH', { USERNAME: normalise(email), PASSWORD: password }),

    refresh: (refreshToken) =>
      authenticate('REFRESH_TOKEN_AUTH', { REFRESH_TOKEN: refreshToken }, refreshToken),

    async getUser(accessToken): Promise<User> {
      const { UserAttributes = [] } = await call<{
        UserAttributes?: { Name: string; Value: string }[];
      }>('GetUser', { AccessToken: accessToken });
      const value = (name: string) => UserAttributes.find((a) => a.Name === name)?.Value;
      return {
        email: value(ATTRIBUTE.email) ?? '',
        firstName: value(ATTRIBUTE.firstName) ?? '',
        aiConsent: decodeAiConsent(value(ATTRIBUTE.aiConsent)),
      };
    },

    async saveAiConsent(accessToken, choices) {
      const at = now();
      await call('UpdateUserAttributes', {
        AccessToken: accessToken,
        UserAttributes: [{ Name: ATTRIBUTE.aiConsent, Value: encodeAiConsent(choices, at) }],
      });
      return {
        version: AI_CONSENT_VERSION,
        at: at.toISOString(),
        providers: { openai: true, ...choices },
      };
    },

    async signOut(refreshToken) {
      await call('RevokeToken', { ClientId: clientId, Token: refreshToken });
    },

    async requestPasswordReset(email) {
      try {
        await call('ForgotPassword', { ClientId: clientId, Username: normalise(email) });
      } catch (error) {
        // These answers depend on the account (unknown, unverified, not allowed). Reporting them
        // would tell a stranger which emails are registered, so they look like success.
        const hidden = ['notAuthorized', 'notConfirmed', 'invalidParameter'];
        if (!(error instanceof AuthError) || !hidden.includes(error.code)) throw error;
      }
    },

    async confirmPasswordReset(email, code, newPassword) {
      await call('ConfirmForgotPassword', {
        ClientId: clientId,
        Username: normalise(email),
        ConfirmationCode: code,
        Password: newPassword,
      });
    },

    async signOutEverywhere(accessToken) {
      await call('GlobalSignOut', { AccessToken: accessToken });
    },
  };
}
