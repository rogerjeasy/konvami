import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { FAKE_CODE } from '@/test/fake-auth-provider';
import { createTestAuth, renderScreen } from '@/test/render';
import { ForgotPasswordScreen } from './forgot-password';
import { NewPasswordScreen } from './new-password';
import { PasswordUpdatedScreen } from './password-updated';
import { ResetCodeScreen } from './reset-code';
import { SignInScreen } from './sign-in';
import { WelcomeBackScreen } from './welcome-back';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

const EMAIL = 'amara.diallo@mail.com';
const PASSWORD = 'Sommer2026!';
const NEW_PASSWORD = 'Bergsee!Wandern42';
const CONSENT = { elevenlabs: true, bedrock: true };

async function withAccount() {
  const auth = await createTestAuth();
  auth.provider.addAccount(EMAIL, PASSWORD);
  return auth;
}

async function signedIn() {
  const auth = await withAccount();
  await auth.session.signIn(EMAIL, PASSWORD);
  return auth;
}

async function enter(password: string, email = EMAIL) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

const submit = () => screen.getByRole('button', { name: /^(Sign in|Try again)$/ });

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

describe('3.1 Sign in', () => {
  it('signs in and resumes at AI consent for someone who has not agreed yet', async () => {
    const auth = await withAccount();
    await renderScreen(<SignInScreen />, { auth });
    expect(screen.getByRole('header', { name: 'Welcome back' })).toBeTruthy();
    expect(submit()).toBeDisabled();

    await enter(PASSWORD);
    await fireEvent.press(submit());

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/ai-consent'));
    expect(auth.session.getState()).toMatchObject({ status: 'signedIn', user: { email: EMAIL } });
  });

  it('goes into the app for someone who has already agreed to the AI consent', async () => {
    const auth = await withAccount();
    await auth.session.signIn(EMAIL, PASSWORD);
    await auth.session.saveAiConsent(CONSENT);
    await auth.session.signOut();

    await renderScreen(<SignInScreen />, { auth });
    await enter(PASSWORD);
    await fireEvent.press(submit());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'));
  });

  it('starts with the email already known from the previous screen', async () => {
    await renderScreen(<SignInScreen />, { access: { email: EMAIL } });
    expect(screen.getByLabelText('Email').props.value).toBe(EMAIL);
  });

  it.each([
    ['an email that is not valid', 'amara@mail', PASSWORD],
    ['no password', EMAIL, ''],
  ])('does not allow sign-in with %s', async (_, email, password) => {
    await renderScreen(<SignInScreen />);
    await enter(password, email);
    expect(submit()).toBeDisabled();
  });

  it('leads to password reset, sign-up and back', async () => {
    await renderScreen(<SignInScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(router.push).toHaveBeenCalledWith('/forgot-password');
    await fireEvent.press(screen.getByRole('link', { name: 'Create an account' }));
    expect(router.push).toHaveBeenCalledWith('/age-check');
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalled();
  });

  it.each([
    ['Sign in with Apple', 'Apple sign-in is coming soon. Use email for now.'],
    ['Sign in with Google', 'Google sign-in is coming soon. Use email for now.'],
    [
      'Email me a sign-in link instead',
      'Sign-in links by email are coming soon. Use your password for now.',
    ],
  ])('says "%s" is not available yet instead of doing nothing', async (button, notice) => {
    await renderScreen(<SignInScreen />);
    await fireEvent.press(screen.getByRole('button', { name: button }));
    expect(screen.getByText(notice)).toBeTruthy();
  });

  it('sends someone whose email was never verified on to the code, with a new code', async () => {
    const auth = await createTestAuth();
    await auth.provider.signUp({
      email: EMAIL,
      password: PASSWORD,
      firstName: 'Amara',
      locale: 'en',
      ageBracket: '25-34',
      tipsOptIn: false,
    });
    await renderScreen(<SignInScreen />, { auth });
    await enter(PASSWORD);
    await fireEvent.press(submit());

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/verify-email'));
    expect(auth.provider.calls.at(-1)).toEqual(['resendCode', EMAIL]);
  });

  it.each([
    ['network', 'Can’t reach Konvami. Check your connection and try again.'],
    ['tooManyAttempts', 'Too many tries. Wait a few minutes and try again.'],
    ['unknown', 'Something went wrong. Please try again.'],
  ] as const)(
    'explains a "%s" failure without counting it as a wrong password',
    async (code, message) => {
      const auth = await withAccount();
      auth.provider.failNext('signIn', code);
      await renderScreen(<SignInScreen />, { auth });
      await enter(PASSWORD);
      await fireEvent.press(submit());

      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.queryByText(/tr(y|ies) left/)).toBeNull();
      expect(router.replace).not.toHaveBeenCalled();
    },
  );
});

describe('3.2 Sign in · error', () => {
  it('says the password does not match and how many tries are left', async () => {
    const auth = await withAccount();
    await renderScreen(<SignInScreen />, { auth });
    await enter('sommer2026');
    await fireEvent.press(submit());

    expect(await screen.findByText('That password doesn’t match')).toBeTruthy();
    expect(screen.getByText('4 tries left before a 5-minute pause')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(auth.session.getState().status).toBe('signedOut');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('gives the same answer for an email with no account, so it never reveals who is registered', async () => {
    await renderScreen(<SignInScreen />);
    await enter(PASSWORD, 'nobody@mail.com');
    await fireEvent.press(submit());
    expect(await screen.findByText('That password doesn’t match')).toBeTruthy();
  });

  it('offers password reset from the error', async () => {
    const auth = await withAccount();
    await renderScreen(<SignInScreen />, { auth });
    await enter('wrong');
    await fireEvent.press(submit());
    await fireEvent.press(await screen.findByRole('link', { name: 'reset your password' }));
    expect(router.push).toHaveBeenCalledWith('/forgot-password');
  });

  it('pauses sign-in for five minutes after five wrong passwords, then allows it again', async () => {
    jest.useFakeTimers();
    const auth = await withAccount();
    await renderScreen(<SignInScreen />, { auth });
    await enter('wrong');
    for (let i = 0; i < 5; i++) {
      await fireEvent.press(submit());
      await act(async () => void (await jest.advanceTimersByTimeAsync(10)));
    }

    expect(screen.getByText('Too many tries')).toBeTruthy();
    expect(screen.getByText('5:00')).toBeTruthy();
    expect(submit()).toBeDisabled();
    const triesBefore = auth.provider.calls.length;
    await fireEvent.press(submit());
    expect(auth.provider.calls.length).toBe(triesBefore);

    await act(async () => void (await jest.advanceTimersByTimeAsync(5 * 60 * 1000)));
    expect(screen.queryByText('Too many tries')).toBeNull();
    expect(submit()).toBeEnabled();
    jest.useRealTimers();
  });

  it('keeps the pause when the app is closed and opened again', async () => {
    const auth = await withAccount();
    const first = await renderScreen(<SignInScreen />, { auth });
    await enter('wrong');
    for (let i = 0; i < 5; i++) {
      await fireEvent.press(submit());
      await screen.findByText(i < 4 ? /tr(y|ies) left/ : 'Too many tries');
    }
    await first.unmount();

    await renderScreen(<SignInScreen />, { auth });
    expect(await screen.findByText('Too many tries')).toBeTruthy();
  });

  it('forgets earlier wrong passwords after a successful sign-in', async () => {
    const auth = await withAccount();
    const first = await renderScreen(<SignInScreen />, { auth });
    await enter('wrong');
    await fireEvent.press(submit());
    await screen.findByText('4 tries left before a 5-minute pause');
    await enter(PASSWORD);
    await fireEvent.press(submit());
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    await first.unmount();
    await auth.session.signOut();

    await renderScreen(<SignInScreen />, { auth });
    await enter('wrong');
    await fireEvent.press(submit());
    expect(await screen.findByText('4 tries left before a 5-minute pause')).toBeTruthy();
  });
});

describe('3.3 Welcome back', () => {
  const { FACIAL_RECOGNITION } = LocalAuthentication.AuthenticationType;

  function withFaceId() {
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
    jest
      .mocked(LocalAuthentication.supportedAuthenticationTypesAsync)
      .mockResolvedValue([FACIAL_RECOGNITION]);
  }

  afterEach(() => {
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(false);
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(false);
    jest.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([]);
  });

  it('greets the user and lets them in with Face ID', async () => {
    withFaceId();
    const auth = await signedIn();
    await auth.session.saveAiConsent(CONSENT);
    await renderScreen(<WelcomeBackScreen />, { auth });
    expect(screen.getByRole('header', { name: 'Hi again, Amara' })).toBeTruthy();
    expect(screen.getByText(EMAIL)).toBeTruthy();

    await fireEvent.press(await screen.findByRole('button', { name: 'Continue with Face ID' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'));
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Unlock Konvami' }),
    );
  });

  it('keeps the user out when Face ID is not confirmed, and says what to do', async () => {
    withFaceId();
    jest
      .mocked(LocalAuthentication.authenticateAsync)
      .mockResolvedValueOnce({ success: false, error: 'user_cancel' } as never);
    const auth = await signedIn();
    await renderScreen(<WelcomeBackScreen />, { auth });
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue with Face ID' }));

    expect(
      await screen.findByText('That didn’t work. Try again, or use your password.'),
    ).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('offers the password instead', async () => {
    withFaceId();
    const auth = await signedIn();
    await renderScreen(<WelcomeBackScreen />, { auth });
    await fireEvent.press(screen.getByRole('button', { name: 'Use password instead' }));
    expect(router.push).toHaveBeenCalledWith('/sign-in');
  });

  it('signs out and goes to sign-in when someone else wants to use the app', async () => {
    withFaceId();
    const auth = await signedIn();
    await renderScreen(<WelcomeBackScreen />, { auth });
    await fireEvent.press(screen.getByRole('link', { name: 'Switch account' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'));
    expect(auth.session.getState().status).toBe('signedOut');
  });

  it('lets the user straight in on a device with nothing to unlock with', async () => {
    const auth = await signedIn();
    await renderScreen(<WelcomeBackScreen />, { auth });
    expect(await screen.findByText('redirect:/ai-consent')).toBeTruthy();
  });

  it('sends someone who is not signed in to Welcome', async () => {
    await renderScreen(<WelcomeBackScreen />);
    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});

describe('3.5 Forgot password', () => {
  it('sends a reset code to the email and moves on', async () => {
    const auth = await withAccount();
    await renderScreen(<ForgotPasswordScreen />, { auth, access: { email: EMAIL } });
    expect(screen.getByLabelText('Email').props.value).toBe(EMAIL);

    await fireEvent.press(screen.getByRole('button', { name: 'Send reset code' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/reset-code'));
    expect(auth.provider.calls).toEqual([['requestPasswordReset', EMAIL]]);
  });

  it('does not send anything for an email that is not valid', async () => {
    await renderScreen(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'amara@mail');
    expect(screen.getByRole('button', { name: 'Send reset code' })).toBeDisabled();
  });

  it('explains a failure and stays on the screen', async () => {
    const auth = await withAccount();
    auth.provider.failNext('requestPasswordReset', 'network');
    await renderScreen(<ForgotPasswordScreen />, { auth, access: { email: EMAIL } });
    await fireEvent.press(screen.getByRole('button', { name: 'Send reset code' }));

    expect(
      await screen.findByText('Can’t reach Konvami. Check your connection and try again.'),
    ).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('goes back to sign in', async () => {
    await renderScreen(<ForgotPasswordScreen />);
    await fireEvent.press(screen.getByRole('link', { name: 'Back to sign in' }));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('3.6 Check your email', () => {
  const access = { email: EMAIL };

  it('takes the code and moves on to the new password', async () => {
    await renderScreen(<ResetCodeScreen />, { access });
    expect(screen.getByText(EMAIL)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Reset code'), FAKE_CODE);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.push).toHaveBeenCalledWith('/new-password');
  });

  it('says so when the code was refused', async () => {
    await renderScreen(<ResetCodeScreen />, { access: { ...access, codeRefused: true } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That code isn’t right or has expired. Enter it again or request a new one.',
    );
  });

  it('offers a new code only after a minute, then sends one', async () => {
    jest.useFakeTimers();
    const auth = await withAccount();
    await renderScreen(<ResetCodeScreen />, { auth, access });
    expect(screen.queryByRole('button', { name: 'Resend code' })).toBeNull();

    await act(async () => void jest.advanceTimersByTime(60_000));
    await fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));

    expect(
      await screen.findByText('If the account exists, a new code is on its way.'),
    ).toBeTruthy();
    expect(auth.provider.calls.at(-1)).toEqual(['requestPasswordReset', EMAIL]);
    jest.useRealTimers();
  });

  it('sends someone who has not asked for a reset back to the start of it', async () => {
    await renderScreen(<ResetCodeScreen />);
    expect(screen.getByText('redirect:/forgot-password')).toBeTruthy();
  });
});

describe('3.7 New password', () => {
  const access = { email: EMAIL, code: FAKE_CODE };

  async function choose(password: string, confirm = password) {
    await fireEvent.changeText(screen.getByLabelText('New password'), password);
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), confirm);
  }

  it('sets the new password, signs out other devices, signs in here and confirms', async () => {
    const auth = await withAccount();
    await renderScreen(<NewPasswordScreen />, { auth, access });
    expect(screen.getByText(EMAIL)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Sign out of other devices' })).toBeChecked();

    await choose(NEW_PASSWORD);
    expect(screen.getByText('Passwords match')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/password-updated'));
    expect(auth.session.getState().status).toBe('signedIn');
    expect(auth.provider.calls.map(([method]) => method)).toContain('signOutEverywhere');
  });

  it('leaves other devices alone when that is switched off', async () => {
    const auth = await withAccount();
    await renderScreen(<NewPasswordScreen />, { auth, access });
    await fireEvent.press(screen.getByRole('switch', { name: 'Sign out of other devices' }));
    await choose(NEW_PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/password-updated'));
    expect(auth.provider.calls.map(([method]) => method)).not.toContain('signOutEverywhere');
  });

  it.each([
    ['the two passwords differ', NEW_PASSWORD, 'Bergsee!Wandern43'],
    ['the password breaks a rule', 'bergsee', 'bergsee'],
  ])('does not allow the update while %s', async (_, password, confirm) => {
    await renderScreen(<NewPasswordScreen />, { access });
    await choose(password, confirm);
    expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled();
  });

  it('says the passwords differ instead of saying they match', async () => {
    await renderScreen(<NewPasswordScreen />, { access });
    await choose(NEW_PASSWORD, 'Bergsee!Wandern43');
    expect(screen.getByRole('alert')).toHaveTextContent('The passwords don’t match.');
    expect(screen.queryByText('Passwords match')).toBeNull();
  });

  it('goes back to the code when the service refuses it', async () => {
    const auth = await withAccount();
    await renderScreen(<NewPasswordScreen />, { auth, access: { ...access, code: '000000' } });
    await choose(NEW_PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(router.replace).not.toHaveBeenCalled();
    expect(auth.session.getState().status).toBe('signedOut');
  });

  it('says so when the password was used before', async () => {
    const auth = await withAccount();
    await renderScreen(<NewPasswordScreen />, { auth, access });
    await choose(PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Update password' }));

    expect(
      await screen.findByText('You’ve used this password before. Choose a new one.'),
    ).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('leaves the reset on Close', async () => {
    await renderScreen(<NewPasswordScreen />, { access });
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(router.replace).toHaveBeenCalledWith('/sign-in');
  });

  it('sends someone without a code back to the start of the reset', async () => {
    await renderScreen(<NewPasswordScreen />, { access: { email: EMAIL } });
    expect(screen.getByText('redirect:/forgot-password')).toBeTruthy();
  });
});

describe('3.8 Password updated', () => {
  it('confirms the change and that other devices were signed out, then continues', async () => {
    const auth = await signedIn();
    await renderScreen(<PasswordUpdatedScreen />, { auth, access: { signedOutOthers: true } });
    expect(screen.getByRole('header', { name: 'Password updated' })).toBeTruthy();
    expect(
      screen.getByText(
        'You’re signed in on this device, and we’ve signed you out everywhere else.',
      ),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Continue to Konvami' }));
    expect(router.replace).toHaveBeenCalledWith('/ai-consent');
  });

  it('does not claim other devices were signed out when they were not', async () => {
    const auth = await signedIn();
    await renderScreen(<PasswordUpdatedScreen />, { auth });
    expect(screen.getByText('You’re signed in on this device.')).toBeTruthy();
    expect(screen.queryByText(/everywhere else/)).toBeNull();
  });

  it('sends someone who is not signed in to sign-in', async () => {
    await renderScreen(<PasswordUpdatedScreen />);
    expect(screen.getByText('redirect:/sign-in')).toBeTruthy();
  });
});
