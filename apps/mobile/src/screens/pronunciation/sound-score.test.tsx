import { screen } from '@testing-library/react-native';
import { renderScreen } from '@/test/render';
import { SoundScoreCard } from './sound-score';

it('names the band and the score, and the word to say again first', async () => {
  await renderScreen(
    <SoundScoreCard
      title="ü"
      score={{ soundId: 'ue', score: 62, band: 'practise', basis: 'phonemes', weakest: 'Tür' }}
    />,
  );
  expect(screen.getByText('Keep practising ü')).toBeTruthy();
  expect(screen.getByText('62 / 100')).toBeTruthy();
  expect(screen.getByText('Say “Tür” again first.')).toBeTruthy();
});

it('says when the score comes from whole words, and asks for nothing more when it is good', async () => {
  await renderScreen(
    <SoundScoreCard
      title="ü"
      score={{ soundId: 'ue', score: 91, band: 'good', basis: 'words', weakest: 'Tür' }}
    />,
  );
  expect(screen.getByText('ü sounds good')).toBeTruthy();
  expect(screen.getByText(/whole words/)).toBeTruthy();
  expect(screen.queryByText(/again first/)).toBeNull();
});
