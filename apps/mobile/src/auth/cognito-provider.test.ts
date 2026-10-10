import type { CognitoOperation } from './cognito-client';
import { createCognitoProvider } from './cognito-provider';
import { AuthError, type AuthErrorCode } from './types';

const NOW = new Date('2026-10-09T12:30:00.000Z');

type Handler = (body: Record<string, unknown>) => Record<string, unknown>;

/** A Cognito double: answers each operation from `handlers` and records what it was sent. */
function setup(handlers: Partial<Record<CognitoOperation, Handler>>) {
  const calls: { operation: CognitoOperation; body: Record<string, unknown> }[] = [];
  const call = jest.fn(async (operation: CognitoOperation, body: Record<string, unknown>) => {
    calls.push({ operation, body });
    const handler = handlers[operation];
    if (!handler) throw new Error(`unexpected ${operation}`);
    return handler(body);
  });
  const provider = createCognitoProvider({
    clientId: 'client-123',
    call: call as never,
    now: () => NOW,
  });
  return { provider, calls };
}

const fail =
  (code: AuthErrorCode): Handler =>
  () => {
    throw new AuthError(code);
  };

const input = {
  email: ' Amara.Diallo@Mail.com ',
  password: 'Sommer2026!',
  firstName: ' Amara ',
  locale: 'de',
  ageBracket: '25-34',
  tipsOptIn: true,
} as const;

describe('signUp', () => {
  it('creates the account with the trimmed, lower-cased email and the sign-up choices', async () => {
    const { provider, calls } = setup({ SignUp: () => ({ UserConfirmed: false }) });
    await provider.signUp(input);

    expect(calls).toEqual([
      {
        operation: 'SignUp',
        body: {
          ClientId: 'client-123',
          Username: 'amara.diallo@mail.com',
          Password: 'Sommer2026!',
          UserAttributes: [
            { Name: 'email', Value: 'amara.diallo@mail.com' },
            { Name: 'given_name', Value: 'Amara' },
            { Name: 'locale', Value: 'de' },
            { Name: 'custom:age_bracket', Value: '25-34' },
            { Name: 'custom:tips_optin', Value: '1|2026-10-09' },
          ],
        },
      },
    ]);
  });

  it('sends a new code when the email has an unfinished sign-up', async () => {
    const { provider, calls } = setup({
      SignUp: fail('emailTaken'),
      ResendConfirmationCode: () => ({}),
    });
    await expect(provider.signUp(input)).resolves.toBeUndefined();
    expect(calls[1]).toEqual({
      operation: 'ResendConfirmationCode',
      body: { ClientId: 'client-123', Username: 'amara.diallo@mail.com' },
    });
  });

  it('fails with "emailTaken" when the email already has a verified account', async () => {
    const { provider } = setup({
      SignUp: fail('emailTaken'),
      ResendConfirmationCode: fail('alreadyConfirmed'),
    });
    await expect(provider.signUp(input)).rejects.toMatchObject({ code: 'emailTaken' });
  });

  it('passes other failures through', async () => {
    const { provider } = setup({ SignUp: fail('invalidPassword') });
    await expect(provider.signUp(input)).rejects.toMatchObject({ code: 'invalidPassword' });
  });
});

describe('verification', () => {
  it('confirms the account with the code', async () => {
    const { provider, calls } = setup({ ConfirmSignUp: () => ({}) });
    await provider.confirmSignUp('Amara@Mail.com', '482915');
    expect(calls[0]?.body).toEqual({
      ClientId: 'client-123',
      Username: 'amara@mail.com',
      ConfirmationCode: '482915',
    });
  });

  it('asks for a new code', async () => {
    const { provider, calls } = setup({ ResendConfirmationCode: () => ({}) });
    await provider.resendCode('amara@mail.com');
    expect(calls[0]?.operation).toBe('ResendConfirmationCode');
  });
});

describe('signIn and refresh', () => {
  it('signs in with email and password and returns the tokens with their expiry time', async () => {
    const { provider, calls } = setup({
      InitiateAuth: () => ({
        AuthenticationResult: {
          AccessToken: 'access-1',
          RefreshToken: 'refresh-1',
          ExpiresIn: 3600,
        },
      }),
    });
    const tokens = await provider.signIn('Amara@Mail.com', 'Sommer2026!');

    expect(calls[0]?.body).toEqual({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: 'client-123',
      AuthParameters: { USERNAME: 'amara@mail.com', PASSWORD: 'Sommer2026!' },
    });
    expect(tokens).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: NOW.getTime() + 3600 * 1000,
    });
  });

  it('fails as "unknown" when sign-in asks for a step the app does not support', async () => {
    const { provider } = setup({ InitiateAuth: () => ({ ChallengeName: 'SMS_MFA' }) });
    await expect(provider.signIn('a@b.co', 'x')).rejects.toMatchObject({ code: 'unknown' });
  });

  it('keeps the refresh token when a refresh does not return a new one', async () => {
    const { provider, calls } = setup({
      InitiateAuth: () => ({ AuthenticationResult: { AccessToken: 'access-2', ExpiresIn: 3600 } }),
    });
    const tokens = await provider.refresh('refresh-1');

    expect(calls[0]?.body).toEqual({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: 'client-123',
      AuthParameters: { REFRESH_TOKEN: 'refresh-1' },
    });
    expect(tokens).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-1' });
  });

  it('uses the new refresh token when a refresh returns one', async () => {
    const { provider } = setup({
      InitiateAuth: () => ({
        AuthenticationResult: {
          AccessToken: 'access-2',
          RefreshToken: 'refresh-2',
          ExpiresIn: 3600,
        },
      }),
    });
    expect((await provider.refresh('refresh-1')).refreshToken).toBe('refresh-2');
  });
});

describe('the user', () => {
  it('reads the profile and consent from the account attributes', async () => {
    const { provider, calls } = setup({
      GetUser: () => ({
        UserAttributes: [
          { Name: 'email', Value: 'amara@mail.com' },
          { Name: 'given_name', Value: 'Amara' },
          {
            Name: 'custom:ai_consent',
            Value: 'v1|2026-10-09T12:30:00.000Z|openai=1,elevenlabs=0,bedrock=1',
          },
        ],
      }),
    });
    expect(await provider.getUser('access-1')).toEqual({
      email: 'amara@mail.com',
      firstName: 'Amara',
      aiConsent: {
        version: 'v1',
        at: '2026-10-09T12:30:00.000Z',
        providers: { openai: true, elevenlabs: false, bedrock: true },
      },
    });
    expect(calls[0]?.body).toEqual({ AccessToken: 'access-1' });
  });

  it('has no consent before the consent screen is completed', async () => {
    const { provider } = setup({
      GetUser: () => ({ UserAttributes: [{ Name: 'email', Value: 'amara@mail.com' }] }),
    });
    expect(await provider.getUser('access-1')).toEqual({
      email: 'amara@mail.com',
      firstName: '',
      aiConsent: null,
    });
  });

  it('stores the AI consent on the account and returns the record', async () => {
    const { provider, calls } = setup({ UpdateUserAttributes: () => ({}) });
    const consent = await provider.saveAiConsent('access-1', { elevenlabs: true, bedrock: false });

    expect(calls[0]?.body).toEqual({
      AccessToken: 'access-1',
      UserAttributes: [
        {
          Name: 'custom:ai_consent',
          Value: 'v1|2026-10-09T12:30:00.000Z|openai=1,elevenlabs=1,bedrock=0',
        },
      ],
    });
    expect(consent.providers).toEqual({ openai: true, elevenlabs: true, bedrock: false });
  });
});

describe('signOut', () => {
  it('revokes the refresh token', async () => {
    const { provider, calls } = setup({ RevokeToken: () => ({}) });
    await provider.signOut('refresh-1');
    expect(calls[0]).toEqual({
      operation: 'RevokeToken',
      body: { ClientId: 'client-123', Token: 'refresh-1' },
    });
  });
});

describe('password reset', () => {
  it('asks for a reset code for the trimmed, lower-cased email', async () => {
    const { provider, calls } = setup({ ForgotPassword: () => ({}) });
    await provider.requestPasswordReset(' Amara@Mail.com ');
    expect(calls).toEqual([
      { operation: 'ForgotPassword', body: { ClientId: 'client-123', Username: 'amara@mail.com' } },
    ]);
  });

  it.each(['notAuthorized', 'notConfirmed', 'invalidParameter'] as const)(
    'answers the same when the service refuses with "%s", so it never reveals whether an account exists',
    async (code) => {
      const { provider } = setup({ ForgotPassword: fail(code) });
      await expect(provider.requestPasswordReset('amara@mail.com')).resolves.toBeUndefined();
    },
  );

  it.each(['network', 'tooManyAttempts', 'unknown'] as const)(
    'still reports a "%s" failure, because the user can act on it',
    async (code) => {
      const { provider } = setup({ ForgotPassword: fail(code) });
      await expect(provider.requestPasswordReset('amara@mail.com')).rejects.toMatchObject({ code });
    },
  );

  it('sets the new password with the code from the email', async () => {
    const { provider, calls } = setup({ ConfirmForgotPassword: () => ({}) });
    await provider.confirmPasswordReset('Amara@Mail.com', '482915', 'Bergsee!Wandern42');
    expect(calls[0]).toEqual({
      operation: 'ConfirmForgotPassword',
      body: {
        ClientId: 'client-123',
        Username: 'amara@mail.com',
        ConfirmationCode: '482915',
        Password: 'Bergsee!Wandern42',
      },
    });
  });

  it('signs the account out on every device', async () => {
    const { provider, calls } = setup({ GlobalSignOut: () => ({}) });
    await provider.signOutEverywhere('access-1');
    expect(calls[0]).toEqual({ operation: 'GlobalSignOut', body: { AccessToken: 'access-1' } });
  });
});

describe('changing the account', () => {
  it('stores a new first name, trimmed', async () => {
    const { provider, calls } = setup({ UpdateUserAttributes: () => ({}) });

    await provider.updateName('access-1', '  Amara Sophie ');

    expect(calls).toEqual([
      {
        operation: 'UpdateUserAttributes',
        body: {
          AccessToken: 'access-1',
          UserAttributes: [{ Name: 'given_name', Value: 'Amara Sophie' }],
        },
      },
    ]);
  });

  it('stores the app language on the account', async () => {
    const { provider, calls } = setup({ UpdateUserAttributes: () => ({}) });

    await provider.updateLocale('access-1', 'fr');

    expect(calls[0]?.body).toEqual({
      AccessToken: 'access-1',
      UserAttributes: [{ Name: 'locale', Value: 'fr' }],
    });
  });

  it('changes the password with the current one as proof', async () => {
    const { provider, calls } = setup({ ChangePassword: () => ({}) });

    await provider.changePassword('access-1', 'Sommer2026!', 'Winter2027?');

    expect(calls).toEqual([
      {
        operation: 'ChangePassword',
        body: {
          AccessToken: 'access-1',
          PreviousPassword: 'Sommer2026!',
          ProposedPassword: 'Winter2027?',
        },
      },
    ]);
  });

  it('reports a wrong current password', async () => {
    const { provider } = setup({ ChangePassword: fail('notAuthorized') });

    await expect(provider.changePassword('access-1', 'wrong', 'Winter2027?')).rejects.toMatchObject(
      { code: 'notAuthorized' },
    );
  });

  it('asks for a new email address, which sends a code to it', async () => {
    const { provider, calls } = setup({
      UpdateUserAttributes: () => ({
        CodeDeliveryDetailsList: [{ AttributeName: 'email', DeliveryMedium: 'EMAIL' }],
      }),
    });

    await provider.requestEmailChange('access-1', ' Amara@NewMail.com ');

    expect(calls[0]?.body).toEqual({
      AccessToken: 'access-1',
      UserAttributes: [{ Name: 'email', Value: 'amara@newmail.com' }],
    });
  });

  it('confirms the new email address with the code', async () => {
    const { provider, calls } = setup({ VerifyUserAttribute: () => ({}) });

    await provider.confirmEmailChange('access-1', '482915');

    expect(calls).toEqual([
      {
        operation: 'VerifyUserAttribute',
        body: { AccessToken: 'access-1', AttributeName: 'email', Code: '482915' },
      },
    ]);
  });
});
