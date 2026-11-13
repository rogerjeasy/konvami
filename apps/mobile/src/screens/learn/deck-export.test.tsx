import { fireEvent, screen } from '@testing-library/react-native';
import { deviceLibraryMedia } from '@/offline/device-media';
import { createFakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { DeckExport } from './deck-export';

jest.mock('@/offline/device-media', () => ({
  deviceLibraryMedia: { share: jest.fn(async () => undefined) },
}));

it('shares an authenticated Anki text export only when requested', async () => {
  const api = createFakeApi();
  api.enterApp();
  const shared = jest.mocked(deviceLibraryMedia.share);
  shared.mockClear();
  await renderScreen(<DeckExport />, { api, signedIn: true });
  expect(shared).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Export to Anki' }));
  expect(api.calls).toContainEqual(['exportCards']);
  expect(shared).toHaveBeenCalledWith(
    expect.stringContaining('#separator:Tab'),
    'konvami-vocabulary',
    'tsv',
  );
});

it('shows a retryable failure if sharing is unavailable', async () => {
  const api = createFakeApi();
  api.enterApp();
  jest.mocked(deviceLibraryMedia.share).mockRejectedValueOnce(new Error('Sharing unavailable'));
  await renderScreen(<DeckExport />, { api, signedIn: true });
  await fireEvent.press(screen.getByRole('button', { name: 'Export to Anki' }));
  expect(await screen.findByText('The cards could not be exported. Try again.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Export to Anki' })).not.toBeDisabled();
});
