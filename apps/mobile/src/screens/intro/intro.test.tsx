import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderScreen } from '@/test/render';
import { IntroScreen } from '.';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

describe('IntroScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens on the first slide', async () => {
    await renderScreen(<IntroScreen />);
    expect(screen.getByText('Speak from day one')).toBeTruthy();
    expect(screen.getAllByLabelText('Page 1 of 3').length).toBeGreaterThan(0);
  });

  it('Skip goes to Welcome', async () => {
    await renderScreen(<IntroScreen />);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Skip' })[0]!);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/welcome'));
  });

  it('the last slide offers Get started', async () => {
    await renderScreen(<IntroScreen />);
    expect(screen.getByText('A buddy who remembers you')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Get started' })).toHaveLength(1);
  });
});
