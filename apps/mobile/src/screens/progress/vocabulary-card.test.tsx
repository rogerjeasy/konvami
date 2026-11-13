import { screen } from '@testing-library/react-native';
import { renderScreen } from '@/test/render';
import { VocabularyCard } from './vocabulary-card';

it('distinguishes verified use from words only heard in conversation', async () => {
  await renderScreen(<VocabularyCard active={12} passive={8} />);
  expect(screen.getByText('Used correctly: 12')).toBeTruthy();
  expect(screen.getByText('Heard only: 8')).toBeTruthy();
});
