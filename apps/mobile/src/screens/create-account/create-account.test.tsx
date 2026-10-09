import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { FAKE_CODE } from '@/test/fake-auth-provider';
import { createTestAuth, renderScreen } from '@/test/render';
import { AgeCheckScreen } from './age-check';
import { AgeRestrictedScreen } from './age-restricted';
import { AiConsentScreen } from './ai-consent';
import { AllSetScreen } from './all-set';
import { CreateAccountScreen } from './create-account';
import { EmailSignUpScreen } from './email-sign-up';
import { MicrophoneScreen } from './microphone';
import { VerifyEmailScreen } from './verify-email';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

const EMAIL = 'amara.diallo@mail.com';
const PASSWORD = 'Sommer2026!';
const TODAY = new Date('2026-10-09T12:00:00');

const step = (wheel: string, action: 'increment' | 'decrement') =>
  fireEvent(screen.getByRole('adjustable', { name: wheel }), 'accessibilityAction', {
    nativeEvent: { actionName: action },
  });

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

describe('2.1 Age check', () => {
  it('keeps Continue off until the birthday has been set', async () => {
    await renderScreen(<AgeCheckScreen today={TODAY} />);
    expect(screen.getByRole('header', { name: 'When’s your birthday?' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Step 1 of 4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await step('Year', 'decrement');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('continues to account creation for someone aged 16 or over', async () => {
    await renderScreen(<AgeCheckScreen today={TODAY} />);
    await step('Year', 'decrement');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.push).toHaveBeenCalledWith('/create-account');
  });

  it('turns away someone under 16', async () => {
    await renderScreen(<AgeCheckScreen today={TODAY} />);
    // The wheel starts 18 years back; three years later is a 15th birthday today.
    await step('Year', 'increment');
    await step('Year', 'increment');
    await step('Year', 'increment');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.push).toHaveBeenCalledWith('/age-restricted');
    expect(router.push).not.toHaveBeenCalledWith('/create-account');
  });

  it('never offers a day the chosen month does not have', async () => {
    // The wheel starts 18 years back: 31 March 2009. February 2009 has 28 days.
    await renderScreen(<AgeCheckScreen today={new Date('2027-03-31T12:00:00')} />);
    await step('Month', 'decrement');
    expect(screen.getByRole('adjustable', { name: 'Day' }).props.accessibilityValue).toEqual({
      text: '28',
    });
  });

  it('goes back', async () => {
    await renderScreen(<AgeCheckScreen today={TODAY} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('Age restricted', () => {
  it('explains the age limit and leads back to the start', async () => {
    await renderScreen(<AgeRestrictedScreen />);
    expect(screen.getByRole('header', { name: 'Come back when you’re 16' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to start' }));
    expect(router.replace).toHaveBeenCalledWith('/welcome');
  });
});

describe('2.2 Create account', () => {
  it('continues with email', async () => {
    await renderScreen(<CreateAccountScreen />, { draft: { ageBracket: '25-34' } });
    expect(screen.getByRole('progressbar', { name: 'Step 2 of 4' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with email' }));
    expect(router.push).toHaveBeenCalledWith('/sign-up-email');
  });

  it.each([
    ['Continue with Apple', 'Apple sign-in is coming soon. Use email for now.'],
    ['Continue with Google', 'Google sign-in is coming soon. Use email for now.'],
  ])('says %s is not available yet instead of doing nothing', async (button, notice) => {
    await renderScreen(<CreateAccountScreen />, { draft: { ageBracket: '25-34' } });
    await fireEvent.press(screen.getByRole('button', { name: button }));
    expect(screen.getByText(notice)).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('leads to sign in for someone who already has an account', async () => {
    await renderScreen(<CreateAccountScreen />, { draft: { ageBracket: '25-34' } });
    await fireEvent.press(screen.getByRole('link', { name: 'Sign in' }));
    expect(router.push).toHaveBeenCalledWith('/sign-in');
  });

  it('sends someone who skipped the age check back to it', async () => {
    await renderScreen(<CreateAccountScreen />);
    expect(screen.getByText('redirect:/age-check')).toBeTruthy();
  });
});

describe('2.3 Sign up with email', () => {
  const draft = { ageBracket: '25-34' } as const;

  async function fill({ confirm = PASSWORD }: { confirm?: string } = {}) {
    await fireEvent.changeText(screen.getByLabelText('First name'), 'Amara');
    await fireEvent.changeText(screen.getByLabelText('Email'), EMAIL);
    await fireEvent.changeText(screen.getByLabelText('Password'), PASSWORD);
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), confirm);
  }

  it('creates the account with what was entered and moves on to the code', async () => {
    const auth = await createTestAuth();
    await renderScreen(<EmailSignUpScreen />, { auth, draft });
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();

    await fill();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/verify-email'));
    expect(auth.provider.calls).toEqual([
      [
        'signUp',
        {
          email: EMAIL,
          password: PASSWORD,
          firstName: 'Amara',
          locale: 'en',
          ageBracket: '25-34',
          tipsOptIn: false,
        },
      ],
    ]);
  });

  it('sends the email-tips choice when it is switched on', async () => {
    const auth = await createTestAuth();
    await renderScreen(<EmailSignUpScreen />, { auth, draft });
    await fill();
    await fireEvent.press(screen.getByRole('switch', { name: 'Learning tips by email' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(auth.provider.calls[0]?.[1]).toMatchObject({ tipsOptIn: true });
  });

  it('does not allow sign-up while the two passwords differ', async () => {
    await renderScreen(<EmailSignUpScreen />, { draft });
    await fill({ confirm: 'Sommer2026?' });
    expect(screen.getByRole('alert')).toHaveTextContent('The passwords don’t match.');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });

  it.each([
    ['a first name', 'First name', ' '],
    ['a valid email', 'Email', 'amara@mail'],
    ['a password that meets the rules', 'Password', 'sommer'],
  ])('does not allow sign-up without %s', async (_, field, value) => {
    await renderScreen(<EmailSignUpScreen />, { draft });
    await fill();
    await fireEvent.changeText(screen.getByLabelText(field), value);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });

  it('says so when the email already has an account, and stays on the screen', async () => {
    const auth = await createTestAuth();
    auth.provider.addAccount(EMAIL, 'Another1!');
    await renderScreen(<EmailSignUpScreen />, { auth, draft });
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('This email already has an account.')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();

    // The way forward for that person is to sign in, so it is offered right there.
    await fireEvent.press(screen.getByRole('link', { name: 'Sign in' }));
    expect(router.push).toHaveBeenCalledWith('/sign-in');
  });

  it.each([
    ['network', 'Can’t reach Konvami. Check your connection and try again.'],
    ['tooManyAttempts', 'Too many tries. Wait a few minutes and try again.'],
    ['invalidPassword', 'Choose a different password.'],
    ['notConfigured', 'Sign-up isn’t set up in this build yet.'],
    ['unknown', 'Something went wrong. Please try again.'],
  ] as const)('explains a "%s" failure and lets the user try again', async (code, message) => {
    const auth = await createTestAuth();
    auth.provider.failNext('signUp', code);
    await renderScreen(<EmailSignUpScreen />, { auth, draft });
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it('sends someone who skipped the age check back to it', async () => {
    await renderScreen(<EmailSignUpScreen />);
    expect(screen.getByText('redirect:/age-check')).toBeTruthy();
  });
});

describe('2.4 Verify email', () => {
  const draft = {
    ageBracket: '25-34',
    firstName: 'Amara',
    email: EMAIL,
    password: PASSWORD,
  } as const;

  async function signedUp() {
    const auth = await createTestAuth();
    await auth.provider.signUp({ ...draft, locale: 'en', tipsOptIn: false });
    return auth;
  }

  it('verifies the code, signs the user in and moves on to AI consent', async () => {
    const auth = await signedUp();
    await renderScreen(<VerifyEmailScreen />, { auth, draft });
    expect(screen.getByText(EMAIL)).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Step 3 of 4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verify email' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Verification code'), FAKE_CODE);
    await fireEvent.press(screen.getByRole('button', { name: 'Verify email' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/ai-consent'));
    expect(auth.session.getState()).toMatchObject({
      status: 'signedIn',
      user: { email: EMAIL, firstName: 'Amara' },
    });
  });

  it('says so when the code is wrong, and stays signed out', async () => {
    const auth = await signedUp();
    await renderScreen(<VerifyEmailScreen />, { auth, draft });
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '000000');
    await fireEvent.press(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByText('That code isn’t right. Check it and try again.')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
    expect(auth.session.getState().status).toBe('signedOut');
  });

  it('says so when the code has expired', async () => {
    const auth = await signedUp();
    auth.provider.failNext('confirmSignUp', 'expiredCode');
    await renderScreen(<VerifyEmailScreen />, { auth, draft });
    await fireEvent.changeText(screen.getByLabelText('Verification code'), FAKE_CODE);
    await fireEvent.press(screen.getByRole('button', { name: 'Verify email' }));
    expect(await screen.findByText('That code has expired. Request a new one.')).toBeTruthy();
  });

  it('offers a new code only after a minute, then sends one and starts the wait again', async () => {
    jest.useFakeTimers();
    const auth = await signedUp();
    await renderScreen(<VerifyEmailScreen />, { auth, draft });
    expect(screen.queryByRole('button', { name: 'Resend code' })).toBeNull();
    expect(screen.getByText('1:00')).toBeTruthy();

    await act(async () => void jest.advanceTimersByTime(18_000));
    expect(screen.getByText('0:42')).toBeTruthy();

    await act(async () => void jest.advanceTimersByTime(42_000));
    await fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));

    expect(await screen.findByText('We sent you a new code.')).toBeTruthy();
    expect(auth.provider.calls.at(-1)).toEqual(['resendCode', EMAIL]);
    expect(screen.queryByRole('button', { name: 'Resend code' })).toBeNull();
    jest.useRealTimers();
  });

  it('goes back to change the email', async () => {
    const auth = await signedUp();
    await renderScreen(<VerifyEmailScreen />, { auth, draft });
    await fireEvent.press(screen.getByRole('button', { name: 'Change email' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('leads to sign in when the code is right but this password is not the account’s', async () => {
    const auth = await signedUp();
    await renderScreen(<VerifyEmailScreen />, {
      auth,
      draft: { ...draft, password: 'Other2026!' },
    });
    await fireEvent.changeText(screen.getByLabelText('Verification code'), FAKE_CODE);
    await fireEvent.press(screen.getByRole('button', { name: 'Verify email' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'));
  });

  it('sends someone with no sign-up in progress back to the start of it', async () => {
    await renderScreen(<VerifyEmailScreen />);
    expect(screen.getByText('redirect:/age-check')).toBeTruthy();
  });
});

async function signedIn() {
  const auth = await createTestAuth();
  auth.provider.addAccount(EMAIL, PASSWORD);
  await auth.session.signIn(EMAIL, PASSWORD);
  return auth;
}

describe('2.5 AI data consent', () => {
  it('stores the choices on the account and moves on to the microphone', async () => {
    const auth = await signedIn();
    await renderScreen(<AiConsentScreen />, { auth });
    expect(screen.getByRole('progressbar', { name: 'Step 4 of 4' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'OpenAI, required' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('switch', { name: 'AWS Bedrock' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/microphone'));
    expect(auth.session.getState().user?.aiConsent?.providers).toEqual({
      openai: true,
      elevenlabs: true,
      bedrock: false,
    });
  });

  it('skips the microphone screen for someone who has already allowed the microphone', async () => {
    jest
      .mocked(getRecordingPermissionsAsync)
      .mockResolvedValueOnce({ granted: true, canAskAgain: true, status: 'granted' } as never);
    const auth = await signedIn();
    await renderScreen(<AiConsentScreen />, { auth });
    await fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/all-set'));
    expect(router.push).not.toHaveBeenCalledWith('/microphone');
  });

  it('does not move on when the choices could not be saved', async () => {
    const auth = await signedIn();
    auth.provider.failNext('saveAiConsent', 'network');
    await renderScreen(<AiConsentScreen />, { auth });
    await fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

    expect(
      await screen.findByText('Can’t reach Konvami. Check your connection and try again.'),
    ).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    expect(auth.session.getState().user?.aiConsent).toBeNull();
  });

  it('returns to Welcome on Back and keeps the user signed in', async () => {
    const auth = await signedIn();
    await renderScreen(<AiConsentScreen />, { auth });
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.replace).toHaveBeenCalledWith('/welcome');
    expect(auth.session.getState().status).toBe('signedIn');
  });
});

describe('2.6 Microphone', () => {
  it('asks for the microphone and moves on when it is allowed', async () => {
    await renderScreen(<MicrophoneScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Allow microphone' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/all-set'));
    expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('moves on just the same when the microphone is refused', async () => {
    jest
      .mocked(requestRecordingPermissionsAsync)
      .mockResolvedValueOnce({ granted: false, canAskAgain: false, status: 'denied' } as never);
    await renderScreen(<MicrophoneScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Allow microphone' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/all-set'));
  });

  it('moves on when the permission request itself fails', async () => {
    jest.mocked(requestRecordingPermissionsAsync).mockRejectedValueOnce(new Error('no mic'));
    await renderScreen(<MicrophoneScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Allow microphone' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/all-set'));
  });

  it('moves straight on, without asking again, when the microphone is already allowed', async () => {
    jest
      .mocked(getRecordingPermissionsAsync)
      .mockResolvedValueOnce({ granted: true, canAskAgain: true, status: 'granted' } as never);
    await renderScreen(<MicrophoneScreen />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/all-set'));
    expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
  });

  it.each(['Not now', 'Close'])('skips the prompt with "%s"', async (button) => {
    await renderScreen(<MicrophoneScreen />);
    await fireEvent.press(screen.getByRole('button', { name: button }));
    expect(router.replace).toHaveBeenCalledWith('/all-set');
    expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('2.7 All set', () => {
  it('greets the user by name and leads into setup', async () => {
    const auth = await signedIn();
    await renderScreen(<AllSetScreen />, { auth });
    expect(screen.getByRole('header', { name: 'You’re all set, Amara' })).toBeTruthy();
    expect(screen.getByText('Mia · your setup guide')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Start talking with Mia' }));
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('offers the form instead of talking', async () => {
    const auth = await signedIn();
    await renderScreen(<AllSetScreen />, { auth });
    await fireEvent.press(screen.getByRole('button', { name: 'Set up with a form instead' }));
    expect(router.replace).toHaveBeenCalledWith('/home');
  });
});
