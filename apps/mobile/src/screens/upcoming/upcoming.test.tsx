import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createTestAuth, renderScreen } from '@/test/render';
import { UpcomingScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

describe('UpcomingScreen', () => {
  it('offers no sign-out to someone who is not signed in', async () => {
    await renderScreen(<UpcomingScreen />);
    expect(screen.getByRole('header', { name: 'Coming next' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('lets a signed-in user sign out and returns to Welcome', async () => {
    const auth = await createTestAuth();
    auth.provider.addAccount('amara@mail.com', 'Sommer2026!');
    await auth.session.signIn('amara@mail.com', 'Sommer2026!');

    await renderScreen(<UpcomingScreen />, { auth });
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/welcome'));
    expect(auth.session.getState().status).toBe('signedOut');
  });
});
