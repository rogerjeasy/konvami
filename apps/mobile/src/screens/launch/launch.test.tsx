import { screen } from '@testing-library/react-native';
import { renderScreen } from '@/test/render';
import { LaunchScreen } from '.';

describe('LaunchScreen', () => {
  it('shows the brand and a loading indicator (and its animations are valid on native)', async () => {
    await renderScreen(<LaunchScreen />);
    expect(screen.getByLabelText('Konvami')).toBeTruthy();
    expect(screen.getByText('Your conversation friend')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeTruthy();
  });
});
