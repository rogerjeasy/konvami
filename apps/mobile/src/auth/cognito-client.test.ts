import { createCognitoClient } from './cognito-client';
import { AuthError } from './types';

const config = { region: 'eu-central-1', clientId: 'client-123' };

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function clientWith(response: unknown) {
  const fetch = jest.fn(async () => response);
  return { fetch, call: createCognitoClient({ ...config, fetch: fetch as never }) };
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    return (error as AuthError).code;
  }
  throw new Error('expected the call to fail');
}

describe('createCognitoClient', () => {
  it('posts the operation to the regional Cognito endpoint as JSON', async () => {
    const { fetch, call } = clientWith(reply(200, { UserSub: 'u-1' }));
    const result = await call('SignUp', { ClientId: 'client-123', Username: 'a@b.co' });

    expect(result).toEqual({ UserSub: 'u-1' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cognito-idp.eu-central-1.amazonaws.com/');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp',
    });
    expect(JSON.parse(init.body as string)).toEqual({ ClientId: 'client-123', Username: 'a@b.co' });
  });

  it('returns an empty object for an empty success body', async () => {
    const fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    const call = createCognitoClient({ ...config, fetch: fetch as never });
    expect(await call('ConfirmSignUp', {})).toEqual({});
  });

  it.each([
    ['UsernameExistsException', 'emailTaken'],
    ['InvalidPasswordException', 'invalidPassword'],
    ['CodeMismatchException', 'invalidCode'],
    ['ExpiredCodeException', 'expiredCode'],
    ['LimitExceededException', 'tooManyAttempts'],
    ['TooManyRequestsException', 'tooManyAttempts'],
    ['TooManyFailedAttemptsException', 'tooManyAttempts'],
    ['NotAuthorizedException', 'notAuthorized'],
    ['UserNotFoundException', 'notAuthorized'],
    ['UserNotConfirmedException', 'notConfirmed'],
    ['InternalErrorException', 'unknown'],
  ] as const)('maps %s to "%s"', async (type, code) => {
    const { call } = clientWith(reply(400, { __type: type, message: 'details from AWS' }));
    expect(await codeOf(call('SignUp', {}))).toBe(code);
  });

  it('reads the error name when AWS prefixes it with a namespace', async () => {
    const { call } = clientWith(
      reply(400, { __type: 'com.amazonaws.cognito#CodeMismatchException', message: 'x' }),
    );
    expect(await codeOf(call('ConfirmSignUp', {}))).toBe('invalidCode');
  });

  it('recognises "already confirmed" from the resend operation', async () => {
    const { call } = clientWith(
      reply(400, { __type: 'InvalidParameterException', message: 'User is already confirmed.' }),
    );
    expect(await codeOf(call('ResendConfirmationCode', {}))).toBe('alreadyConfirmed');
  });

  it('recognises a locked account, which the service reports as a plain "not authorized"', async () => {
    const { call } = clientWith(
      reply(400, { __type: 'NotAuthorizedException', message: 'Password attempts exceeded' }),
    );
    expect(await codeOf(call('InitiateAuth', {}))).toBe('tooManyAttempts');
  });

  it.each([
    ['PasswordHistoryPolicyViolationException', 'passwordReused'],
    ['InvalidParameterException', 'invalidParameter'],
  ] as const)('maps %s to "%s"', async (type, code) => {
    const { call } = clientWith(reply(400, { __type: type, message: 'details from AWS' }));
    expect(await codeOf(call('ConfirmForgotPassword', {}))).toBe(code);
  });

  it('never puts the provider message or the request into the error', async () => {
    const { call } = clientWith(
      reply(400, { __type: 'NotAuthorizedException', message: 'secret detail' }),
    );
    try {
      await call('InitiateAuth', { AuthParameters: { PASSWORD: 'Sommer2026!' } });
    } catch (error) {
      expect(String(error)).not.toContain('secret detail');
      expect(JSON.stringify(error)).not.toContain('Sommer2026!');
    }
  });

  it('reports a failed connection as "network"', async () => {
    const fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const call = createCognitoClient({ ...config, fetch: fetch as never });
    expect(await codeOf(call('SignUp', {}))).toBe('network');
  });

  it('reports a response that is not JSON as "unknown"', async () => {
    const fetch = jest.fn(async () => ({ ok: false, status: 502, text: async () => '<html>' }));
    const call = createCognitoClient({ ...config, fetch: fetch as never });
    expect(await codeOf(call('SignUp', {}))).toBe('unknown');
  });

  it('gives up with "network" when the server does not answer in time', async () => {
    jest.useFakeTimers();
    const fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const call = createCognitoClient({ ...config, fetch: fetch as never, timeoutMs: 5000 });
    const pending = codeOf(call('SignUp', {}));
    jest.advanceTimersByTime(5000);
    expect(await pending).toBe('network');
    jest.useRealTimers();
  });
});
