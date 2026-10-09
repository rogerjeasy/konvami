import type { Language } from '@/i18n/languages';
import type { AgeBracket } from '@/lib/validation';

/**
 * The app's view of authentication. Screens and the session store depend on this interface only,
 * so the provider (Amazon Cognito today) can be replaced without touching them (spec §15).
 */

/** Why an auth call failed, in the app's own terms. Screens turn a code into a translated message. */
export type AuthErrorCode =
  | 'emailTaken'
  | 'invalidPassword'
  | 'passwordReused'
  | 'invalidCode'
  | 'expiredCode'
  | 'tooManyAttempts'
  | 'notAuthorized'
  | 'notConfirmed'
  | 'alreadyConfirmed'
  | 'invalidParameter'
  | 'network'
  | 'notConfigured'
  | 'unknown';

/**
 * Carries a code and nothing else: no provider message and no request data, so an error can be
 * logged or shown without leaking a password, a token or an internal detail.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode) {
    super(`Auth error: ${code}`);
    this.name = 'AuthError';
    this.code = code;
  }
}

/** Sign-in providers other than email. */
export type SocialProvider = 'apple' | 'google';

/** Tokens for a signed-in user. Only the refresh token is ever written to storage. */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** When the access token stops working (ms since epoch). */
  expiresAt: number;
}

/** The optional AI providers a user can switch off; OpenAI is required for the app to work. */
export interface AiConsentChoices {
  elevenlabs: boolean;
  bedrock: boolean;
}

export interface AiConsent {
  /** Version of the consent text the user agreed to. */
  version: string;
  /** ISO time of the agreement. */
  at: string;
  providers: { openai: true } & AiConsentChoices;
}

export interface User {
  email: string;
  firstName: string;
  /** null until the user has completed 2.5 AI data consent. */
  aiConsent: AiConsent | null;
}

export interface SignUpInput {
  email: string;
  password: string;
  firstName: string;
  /** App language at sign-up, for localised emails later. */
  locale: Language;
  ageBracket: AgeBracket;
  tipsOptIn: boolean;
}

export interface AuthProvider {
  /**
   * Creates the account and sends the verification code. For an email whose earlier sign-up was
   * never verified, sends a new code instead. Fails with `emailTaken` for a verified account.
   */
  signUp(input: SignUpInput): Promise<void>;
  confirmSignUp(email: string, code: string): Promise<void>;
  resendCode(email: string): Promise<void>;
  signIn(email: string, password: string): Promise<Tokens>;
  /** New access token from a refresh token. Fails with `notAuthorized` when it was revoked or expired. */
  refresh(refreshToken: string): Promise<Tokens>;
  getUser(accessToken: string): Promise<User>;
  saveAiConsent(accessToken: string, choices: AiConsentChoices): Promise<AiConsent>;
  /** Revokes the refresh token so it cannot be used again. */
  signOut(refreshToken: string): Promise<void>;
  /**
   * Emails a password-reset code. Resolves the same way whether or not the email has an account,
   * so it cannot be used to find out who is registered.
   */
  requestPasswordReset(email: string): Promise<void>;
  /** Sets a new password with the emailed code. Fails with `passwordReused` for a recent password. */
  confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void>;
  /** Signs the account out on every device, this one included (all refresh tokens stop working). */
  signOutEverywhere(accessToken: string): Promise<void>;
}
