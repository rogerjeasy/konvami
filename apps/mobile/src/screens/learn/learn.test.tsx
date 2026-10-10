import { screen } from '@testing-library/react-native';
import { renderScreen } from '@/test/render';
import { LearnScreen } from '.';
import { ProgressScreen } from '../progress';

describe('5.7 Learn', () => {
  it('says what will be here, and shows nothing that is not the learner’s', async () => {
    await renderScreen(<LearnScreen />, { signedIn: true });

    expect(screen.getByRole('header', { name: 'Learn' })).toBeTruthy();
    expect(screen.getByText('Your words and grammar will live here')).toBeTruthy();
    expect(screen.queryByText(/\d/)).toBeNull();
  });
});

describe('5.8 Progress', () => {
  it('says what will be here, and shows nothing that is not the learner’s', async () => {
    await renderScreen(<ProgressScreen />, { signedIn: true });

    expect(screen.getByRole('header', { name: 'Progress' })).toBeTruthy();
    expect(screen.getByText('Your progress will be charted here')).toBeTruthy();
    expect(screen.queryByText(/\d/)).toBeNull();
  });
});
