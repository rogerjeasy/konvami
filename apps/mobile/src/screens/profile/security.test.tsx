import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi } from '@/test/fake-api';
import { FAKE_CODE } from '@/test/fake-auth-provider';
import { createTestAuth, renderScreen } from '@/test/render';
import { ChangeEmailScreen } from './change-email';
import { ChangePasswordScreen } from './change-password';
import { DeleteAccountScreen } from './delete-account';
import { PrivacyScreen } from './privacy';
import { SecurityScreen } from './security';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

const EMAIL = 'amara.diallo@mail.com';
const PASSWORD = 'Sommer2026!';
const NEW_PASSWORD = 'Winter2027?';

async function open(ui: React.ReactElement, title: string) {
  const auth = await createTestAuth();
  const api = createFakeApi();
  api.enterApp();
  await renderScreen(ui, { auth, api, signedIn: true });
  await screen.findByRole('header', { name: title });
  return { auth, api };
}

describe('6.8 Security', () => {
  it.each([
    ['Change password', '/account/security/password'],
    ['Change email', '/account/security/email'],
  ])('leads to %s', async (row, route) => {
    await open(<SecurityScreen />, 'Security');

    await fireEvent.press(screen.getByRole('button', { name: row }));

    expect(router.push).toHaveBeenCalledWith(route);
  });

  it('signs out of every device only after the learner confirms', async () => {
    const { auth } = await open(<SecurityScreen />, 'Security');

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out of all devices' }));
    expect(await screen.findByRole('header', { name: 'Sign out everywhere?' })).toBeTruthy();
    expect(auth.session.getState().status).toBe('signedIn');

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out everywhere' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/welcome'));
    expect(auth.session.getState().status).toBe('signedOut');
    expect(auth.provider.liveRefreshTokens.size).toBe(0);
  });

  it('stays signed in when the learner changes their mind', async () => {
    const { auth } = await open(<SecurityScreen />, 'Security');

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out of all devices' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));

    expect(auth.session.getState().status).toBe('signedIn');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('says so when the other devices could not be signed out', async () => {
    const { auth } = await open(<SecurityScreen />, 'Security');
    auth.provider.failNext('signOutEverywhere', 'network');

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out of all devices' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out everywhere' }));

    expect(await screen.findByText(/Can’t reach Konvami/)).toBeTruthy();
    expect(auth.session.getState().status).toBe('signedIn');
  });
});

describe('6.8 Security: change password', () => {
  async function fill(current: string, next: string, again = next) {
    await fireEvent.changeText(screen.getByLabelText('Current password'), current);
    await fireEvent.changeText(screen.getByLabelText('New password'), next);
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), again);
  }

  it('changes the password and says so', async () => {
    const { auth } = await open(<ChangePasswordScreen />, 'Change your password');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();

    await fill(PASSWORD, NEW_PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Your password is changed.')).toBeTruthy();
    await expect(auth.provider.signIn(EMAIL, NEW_PASSWORD)).resolves.toBeDefined();
    expect(auth.session.getState().status).toBe('signedIn');
  });

  it('cannot be sent while the new password breaks a rule or the two differ', async () => {
    await open(<ChangePasswordScreen />, 'Change your password');

    await fill(PASSWORD, 'short');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();

    await fill(PASSWORD, NEW_PASSWORD, 'Winter2027!');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
    expect(screen.getByText('The passwords don’t match.')).toBeTruthy();
  });

  it('points at the current password when it is wrong', async () => {
    const { auth } = await open(<ChangePasswordScreen />, 'Change your password');

    await fill('Wrong2026!', NEW_PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('That isn’t your current password.')).toBeTruthy();
    await expect(auth.provider.signIn(EMAIL, PASSWORD)).resolves.toBeDefined();
  });

  it('refuses a password the account already used', async () => {
    const { auth } = await open(<ChangePasswordScreen />, 'Change your password');
    auth.provider.failNext('changePassword', 'passwordReused');

    await fill(PASSWORD, NEW_PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));

    expect(
      await screen.findByText('You’ve used this password before. Choose a new one.'),
    ).toBeTruthy();
  });

  it('goes back once the learner has read that it worked', async () => {
    await open(<ChangePasswordScreen />, 'Change your password');
    await fill(PASSWORD, NEW_PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));

    expect(router.back).toHaveBeenCalled();
  });
});

describe('6.8 Security: change email', () => {
  const NEW_EMAIL = 'amara@newmail.com';

  async function askFor(email: string) {
    await fireEvent.changeText(screen.getByLabelText('New email'), email);
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
  }

  it('changes the email once the code sent to the new address is entered', async () => {
    const { auth } = await open(<ChangeEmailScreen />, 'Change your email');
    expect(screen.getByText(`Current email: ${EMAIL}`)).toBeTruthy();

    await askFor(` ${NEW_EMAIL} `);
    expect(await screen.findByRole('header', { name: 'Check your new inbox' })).toBeTruthy();
    expect(auth.session.getState().user?.email).toBe(EMAIL);

    await fireEvent.changeText(screen.getByLabelText('Verification code'), FAKE_CODE);
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm new email' }));

    expect(await screen.findByText('Your email is changed.')).toBeTruthy();
    expect(auth.session.getState().user?.email).toBe(NEW_EMAIL);
  });

  it('asks for a real address that is not the current one', async () => {
    await open(<ChangeEmailScreen />, 'Change your email');

    await fireEvent.changeText(screen.getByLabelText('New email'), 'amara@');
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled();

    await askFor(EMAIL.toUpperCase());

    expect(await screen.findByText('That is already your email.')).toBeTruthy();
  });

  it('says so when another account uses the address', async () => {
    const { auth } = await open(<ChangeEmailScreen />, 'Change your email');
    auth.provider.addAccount('taken@mail.com', PASSWORD);

    await askFor('taken@mail.com');

    expect(await screen.findByText('Another account already uses this email.')).toBeTruthy();
  });

  it('keeps the email and asks again when the code is wrong', async () => {
    const { auth } = await open(<ChangeEmailScreen />, 'Change your email');
    await askFor(NEW_EMAIL);
    await screen.findByRole('header', { name: 'Check your new inbox' });

    await fireEvent.changeText(screen.getByLabelText('Verification code'), '000000');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm new email' }));

    expect(await screen.findByText('That code isn’t right. Check it and try again.')).toBeTruthy();
    expect(auth.session.getState().user?.email).toBe(EMAIL);
  });

  it('lets the learner go back to use another address', async () => {
    await open(<ChangeEmailScreen />, 'Change your email');
    await askFor(NEW_EMAIL);

    await fireEvent.press(await screen.findByRole('button', { name: 'Use another address' }));

    expect(await screen.findByRole('header', { name: 'Change your email' })).toBeTruthy();
    expect(screen.getByLabelText('New email')).toHaveProp('value', NEW_EMAIL);
  });
});

describe('6.7 Privacy and AI', () => {
  it('shows what the learner agreed to', async () => {
    const auth = await createTestAuth();
    auth.provider.addAccount(EMAIL, PASSWORD);
    await auth.session.signIn(EMAIL, PASSWORD);
    await auth.session.saveAiConsent({ elevenlabs: true, bedrock: false });
    await renderScreen(<PrivacyScreen />, { auth });

    expect(await screen.findByRole('switch', { name: 'ElevenLabs' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'AWS Bedrock' })).not.toBeChecked();
    // The conversation itself runs on OpenAI: it cannot be switched off.
    expect(screen.getByRole('switch', { name: 'OpenAI, required' })).toBeDisabled();
  });

  it('stores a changed choice on the account at once', async () => {
    const { auth } = await open(<PrivacyScreen />, 'Privacy and AI');

    await fireEvent.press(screen.getByRole('switch', { name: 'ElevenLabs' }));

    expect(await screen.findByText('Your choices are saved.')).toBeTruthy();
    expect(auth.session.getState().user?.aiConsent?.providers).toEqual({
      openai: true,
      elevenlabs: true,
      bedrock: false,
    });
  });

  it('puts the switch back when the choice could not be stored', async () => {
    const { auth } = await open(<PrivacyScreen />, 'Privacy and AI');
    auth.provider.failNext('saveAiConsent', 'network');

    await fireEvent.press(screen.getByRole('switch', { name: 'ElevenLabs' }));

    expect(await screen.findByText(/Can’t reach Konvami/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'ElevenLabs' })).not.toBeChecked();
  });

  it('leads to deleting the account', async () => {
    await open(<PrivacyScreen />, 'Privacy and AI');

    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));

    expect(router.push).toHaveBeenCalledWith('/account/delete');
  });
});

describe('6.9 Delete account', () => {
  async function ask(password: string) {
    await fireEvent.changeText(screen.getByLabelText('Your password'), password);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
  }

  it('says what will be deleted', async () => {
    await open(<DeleteAccountScreen />, 'Delete your account');

    for (const item of [
      'Your account and sign-in',
      'Your profile, level and goals',
      'Your partners',
      'Every conversation and transcript',
      'Your photo',
    ]) {
      expect(screen.getByText(item)).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeDisabled();
  });

  it('deletes everything only after the password and a last confirmation', async () => {
    const { auth, api } = await open(<DeleteAccountScreen />, 'Delete your account');

    await ask(PASSWORD);
    expect(await screen.findByRole('header', { name: 'Delete everything?' })).toBeTruthy();
    expect(api.deleted).toBe(false);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete forever' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/welcome'));
    expect(api.deleted).toBe(true);
    expect(auth.session.getState()).toEqual({ status: 'signedOut', user: null });
  });

  it('signs in again with the password right before deleting, as the server requires', async () => {
    const { auth, api } = await open(<DeleteAccountScreen />, 'Delete your account');
    const [sessionBefore] = [...auth.provider.liveRefreshTokens];

    await ask(PASSWORD);
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete forever' }));

    await waitFor(() => expect(api.deleted).toBe(true));
    // Two sign-ins: the one that opened the app, and the one made for the deletion.
    expect(auth.provider.calls.filter(([method]) => method === 'signIn')).toHaveLength(2);
    // The deletion went out on the new session: the one closed meanwhile is the old one.
    expect(auth.provider.calls.filter(([method]) => method === 'signOut')).toEqual([
      ['signOut', sessionBefore],
    ]);
  });

  it('keeps the account when the learner changes their mind', async () => {
    const { auth, api } = await open(<DeleteAccountScreen />, 'Delete your account');

    await ask(PASSWORD);
    await fireEvent.press(await screen.findByRole('button', { name: 'Keep my account' }));

    expect(api.deleted).toBe(false);
    expect(auth.session.getState().status).toBe('signedIn');
  });

  it('deletes nothing with a wrong password', async () => {
    const { auth, api } = await open(<DeleteAccountScreen />, 'Delete your account');

    await ask('Wrong2026!');
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete forever' }));

    expect(await screen.findByText('That isn’t your password.')).toBeTruthy();
    expect(api.deleted).toBe(false);
    expect(auth.session.getState().status).toBe('signedIn');
  });

  it('says so when the account could not be deleted, and stays signed in', async () => {
    const { auth, api } = await open(<DeleteAccountScreen />, 'Delete your account');
    api.failNext('deleteAccount', 'network');

    await ask(PASSWORD);
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete forever' }));

    expect(await screen.findByText(/Your account couldn’t be deleted/)).toBeTruthy();
    expect(api.deleted).toBe(false);
    expect(auth.session.getState().status).toBe('signedIn');
  });
});
