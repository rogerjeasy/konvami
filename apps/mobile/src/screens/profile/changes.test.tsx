import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { ProfileChangesScreen } from './changes';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

async function open(api: FakeApi = inApp()) {
  await renderScreen(<ProfileChangesScreen />, { api, signedIn: true });
  return api;
}

describe('6.14 Changes made by voice', () => {
  it('says what a partner changed, from what and to what', async () => {
    const api = inApp();
    api.changedByVoice('explanation_language', 'en', 'fr');
    api.changedByVoice('weekly_habit', null, { days: 3, minutes: 60 });
    await open(api);

    expect(await screen.findByText('Explanation language')).toBeTruthy();
    expect(screen.getByText('Now: Français')).toBeTruthy();
    expect(screen.getByText('Was: English')).toBeTruthy();
    expect(screen.getByText('Weekly goal')).toBeTruthy();
    expect(screen.getByText('Was: None')).toBeTruthy();
    expect(screen.getAllByText('October 9, 2026')).toHaveLength(2);
  });

  it('puts a setting back, and it cannot be undone twice', async () => {
    const api = inApp();
    api.changedByVoice('explanation_language', 'en', 'fr');
    await open(api);

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Undo: Explanation language' }),
    );

    await waitFor(() => expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull());
    expect(api.calls).toContainEqual(['undoProfileChange', 1]);
    expect((await api.getProfile()).languages.de?.explanation_language?.value).toBe('en');
  });

  it('offers Undo only for the latest change of a setting', async () => {
    const api = inApp();
    api.changedByVoice('explanation_language', 'en', 'fr');
    api.changedByVoice('explanation_language', 'fr', 'it');
    await open(api);

    await screen.findAllByText('Explanation language');

    expect(screen.getAllByRole('button', { name: 'Undo: Explanation language' })).toHaveLength(1);
  });

  it('explains a change that was changed again meanwhile', async () => {
    const api = inApp();
    api.changedByVoice('explanation_language', 'en', 'fr');
    await open(api);
    const undo = await screen.findByRole('button', { name: 'Undo: Explanation language' });
    api.failNext('undoProfileChange', 'superseded');

    await fireEvent.press(undo);

    expect(await screen.findByText(/changed this setting again/)).toBeTruthy();
  });

  it('says what will be listed when nothing was changed yet', async () => {
    await open();

    expect(await screen.findByText(/Nothing yet/)).toBeTruthy();
  });

  it('offers another try when the list cannot be read', async () => {
    const api = inApp();
    api.failNext('getProfileChanges', 'network');
    await open(api);

    expect(await screen.findByText(/Can’t reach Konvami/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(/Nothing yet/)).toBeTruthy();
  });
});
