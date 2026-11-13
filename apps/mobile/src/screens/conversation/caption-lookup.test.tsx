import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '@/test/render';
import { CaptionLookupSheet, type CaptionMeaning } from './caption-lookup';

const labels = {
  loading: 'Looking up this word',
  failed: 'Could not look up this word',
  save: 'Save word',
  saved: 'Saved',
  uncertain: 'Meaning uncertain',
  saveFailed: 'Could not save word',
  plural: 'Plural',
};
const meaning: CaptionMeaning = {
  word: 'Termin',
  meaning: 'appointment',
  article: 'der',
  plural: 'Termine',
  unsure: false,
  saved: false,
};

it('explains a word and saves only after the learner asks', async () => {
  let kept: string[] = [];
  await renderScreen(
    <CaptionLookupSheet
      selection={{ word: 'Termin', caption: 'Ich habe einen Termin.', language: 'de' }}
      labels={labels}
      onClose={() => undefined}
      lookup={async () => meaning}
      save={async (language, word, translation) => {
        kept = [language, word, translation];
      }}
    />,
  );
  expect(await screen.findByText('appointment')).toBeTruthy();
  expect(kept).toEqual([]);
  await fireEvent.press(screen.getByRole('button', { name: 'Save word' }));
  expect(await screen.findByRole('button', { name: 'Saved' })).toBeDisabled();
  expect(kept).toEqual(['de', 'Termin', 'appointment']);
});

it('does not offer uncertain meanings as learning cards', async () => {
  await renderScreen(
    <CaptionLookupSheet
      selection={{ word: 'Termin', caption: 'Termin', language: 'de' }}
      labels={labels}
      onClose={() => undefined}
      lookup={async () => ({ ...meaning, unsure: true })}
      save={async () => {
        throw new Error('Should not save');
      }}
    />,
  );
  expect(await screen.findByText('Meaning uncertain')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save word' })).toBeDisabled();
});
