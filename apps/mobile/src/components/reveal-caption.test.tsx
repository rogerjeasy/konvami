import { fireEvent, render, screen } from '@testing-library/react-native';
import { RevealCaption } from './reveal-caption';

it('keeps the answer out of the accessible tree until the learner reveals it', async () => {
  await render(<RevealCaption text="Bonjour !" hiddenLabel="Reveal caption" />);
  expect(screen.queryByText('Bonjour !')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Reveal caption' }));
  expect(screen.getByText('Bonjour !')).toBeTruthy();
});
