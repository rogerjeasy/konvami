import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi } from '@/test/fake-api';
import { createTestAuth, renderScreen } from '@/test/render';
import { AccountScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

describe('5.9 Account', () => {
  it('shows who is signed in', async () => {
    await renderScreen(<AccountScreen />, { signedIn: true });

    expect(screen.getByRole('header', { name: 'Account' })).toBeTruthy();
    expect(screen.getByText('Amara')).toBeTruthy();
    expect(screen.getByText('amara.diallo@mail.com')).toBeTruthy();
  });

  it('goes back to where the learner came from', async () => {
    await renderScreen(<AccountScreen />, { signedIn: true });

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(router.back).toHaveBeenCalled();
  });

  it('signs out, forgets what was loaded and returns to Welcome', async () => {
    const auth = await createTestAuth();
    const api = createFakeApi();
    api.enterApp();
    await renderScreen(<AccountScreen />, { auth, api, signedIn: true });

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/welcome'));
    expect(auth.session.getState().status).toBe('signedOut');
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<AccountScreen />);

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
