import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createFakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { LibraryScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  Redirect: () => null,
  useFocusEffect: jest.fn(),
}));

it('sends transcript search to the library rather than searching only the current page', async () => {
  const api = createFakeApi();
  api.enterApp();
  api.talked(0);
  const get = jest.spyOn(api, 'getConversations');
  await renderScreen(<LibraryScreen />, { api, signedIn: true });
  await waitFor(() => expect(screen.queryByText('Loading your conversations')).toBeNull());
  await fireEvent.changeText(screen.getByLabelText('Search transcripts'), 'weil');
  await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(get).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'weil' })));
});
