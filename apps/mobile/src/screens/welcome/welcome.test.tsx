import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { getPreferences, setLanguage } from '@/preferences';
import { createTestAuth, renderScreen } from '@/test/render';
import { WelcomeScreen } from '.';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

describe('WelcomeScreen', () => {
  afterEach(async () => {
    await act(() => setLanguage(null));
  });

  it('shows the welcome and both entry points', async () => {
    await renderScreen(<WelcomeScreen />);
    expect(screen.getByRole('header', { name: 'Welcome to Konvami' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    expect(router.push).toHaveBeenCalledWith('/age-check');
    await fireEvent.press(screen.getByRole('button', { name: 'I already have an account' }));
    expect(router.push).toHaveBeenCalledWith('/sign-in');
  });

  it('takes a signed-in user who has not agreed to the AI consent back to it, not through sign-up again', async () => {
    const auth = await createTestAuth();
    auth.provider.addAccount('amara@mail.com', 'Sommer2026!');
    await auth.session.signIn('amara@mail.com', 'Sommer2026!');

    await renderScreen(<WelcomeScreen />, { auth });
    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    expect(router.push).toHaveBeenLastCalledWith('/ai-consent');
  });

  it('follows the phone language until another language is picked', async () => {
    await renderScreen(<WelcomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'App language: English' }));
    expect(screen.getByRole('radio', { name: 'Phone language (English)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeChecked();
  });

  it('switches the app language from the language sheet and saves it', async () => {
    await renderScreen(<WelcomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'App language: English' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Deutsch' }));
    expect(screen.getByText('Willkommen bei Konvami')).toBeTruthy();
    expect(getPreferences().language).toBe('de');

    // And back to following the phone (English in tests).
    await fireEvent.press(screen.getByRole('button', { name: 'App-Sprache: Deutsch' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Sprache des Telefons (English)' }));
    expect(screen.getByText('Welcome to Konvami')).toBeTruthy();
    expect(getPreferences().language).toBeNull();
  });
});
