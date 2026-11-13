import { fireEvent, render, screen } from '@testing-library/react-native';
import { CaptionWords } from './caption-words';

it('passes the selected word and original sentence to lookup', async () => {
  let selection: string[] = [];
  await render(
    <CaptionWords
      caption="J’ai rendez-vous."
      lookupLabel={(word) => `Look up ${word}`}
      onSelect={(word, caption) => {
        selection = [word, caption];
      }}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Look up rendez-vous' }));
  expect(selection).toEqual(['rendez-vous', 'J’ai rendez-vous.']);
});
