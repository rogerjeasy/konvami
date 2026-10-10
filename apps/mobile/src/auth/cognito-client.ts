import { AuthError, type AuthErrorCode } from './types';

/**
 * The one place that talks to Amazon Cognito's user-pool API: a JSON POST per operation. These
 * operations need no AWS signature (they are authorised by the app client id or the user's access
 * token), so no AWS SDK is needed.
 */

// How long to wait for Cognito before treating the request as a connection problem (ms).
const DEFAULT_TIMEOUT_MS = 15000;

const ERROR_CODES: Record<string, AuthErrorCode> = {
  UsernameExistsException: 'emailTaken',
  // A changed email address that another account already signs in with.
  AliasExistsException: 'emailTaken',
  InvalidPasswordException: 'invalidPassword',
  PasswordHistoryPolicyViolationException: 'passwordReused',
  InvalidParameterException: 'invalidParameter',
  CodeMismatchException: 'invalidCode',
  ExpiredCodeException: 'expiredCode',
  LimitExceededException: 'tooManyAttempts',
  TooManyRequestsException: 'tooManyAttempts',
  TooManyFailedAttemptsException: 'tooManyAttempts',
  NotAuthorizedException: 'notAuthorized',
  // Same answer as a wrong password, so a caller cannot tell which emails have accounts.
  UserNotFoundException: 'notAuthorized',
  UserNotConfirmedException: 'notConfirmed',
};

export type CognitoOperation =
  | 'SignUp'
  | 'ConfirmSignUp'
  | 'ResendConfirmationCode'
  | 'InitiateAuth'
  | 'GetUser'
  | 'UpdateUserAttributes'
  | 'RevokeToken'
  | 'ForgotPassword'
  | 'ConfirmForgotPassword'
  | 'GlobalSignOut'
  | 'ChangePassword'
  | 'VerifyUserAttribute';

export type CognitoCall = <T = Record<string, unknown>>(
  operation: CognitoOperation,
  body: Record<string, unknown>,
) => Promise<T>;

function errorCode(type: unknown, message: unknown): AuthErrorCode {
  // AWS may prefix the name with a namespace ("com.amazonaws...#CodeMismatchException").
  const name =
    String(type ?? '')
      .split('#')
      .pop() ?? '';
  const text = String(message ?? '');
  // Resending a code to a verified account is reported as a generic invalid parameter.
  if (name === 'InvalidParameterException' && /already confirmed/i.test(text)) {
    return 'alreadyConfirmed';
  }
  // A temporarily locked account is reported as "not authorized", with only the message to tell.
  if (name === 'NotAuthorizedException' && /attempts exceeded/i.test(text)) {
    return 'tooManyAttempts';
  }
  return ERROR_CODES[name] ?? 'unknown';
}

export function createCognitoClient({
  region,
  fetch: send = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  region: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): CognitoCall {
  const url = `https://cognito-idp.${region}.amazonaws.com/`;

  return async function call<T>(operation: CognitoOperation, body: Record<string, unknown>) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    let status: number;
    let text: string;
    try {
      const response = await send(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': `AWSCognitoIdentityProviderService.${operation}`,
        },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      status = response.status;
      text = await response.text();
    } catch {
      // No connection, DNS failure or our own timeout: all "can't reach the service".
      throw new AuthError('network');
    } finally {
      clearTimeout(timer);
    }

    let data: Record<string, unknown>;
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new AuthError('unknown');
    }
    if (status < 200 || status >= 300) throw new AuthError(errorCode(data.__type, data.message));
    return data as T;
  };
}
