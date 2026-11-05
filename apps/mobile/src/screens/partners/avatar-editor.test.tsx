import { fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { createFakeApi, FAKE_PERSONAS, type FakeApi } from '@/test/fake-api';
import { createFakeProfileDevice } from '@/test/fake-profile-device';
import { renderScreen } from '@/test/render';
import { AvatarEditorScreen } from './avatar-editor';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

const LENA = FAKE_PERSONAS[0]!;

async function open(id: string = LENA.id) {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id });
  const api: FakeApi = createFakeApi();
  api.enterApp();
  await renderScreen(<AvatarEditorScreen />, {
    api,
    device: createFakeProfileDevice(),
    signedIn: true,
  });
  return api;
}

const savedLooks = (api: FakeApi) =>
  api.calls.filter(([method]) => method === 'changePersona').map(([, id, change]) => [id, change]);

describe('6.16 Avatar editor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens on the partner’s look with nothing to save yet', async () => {
    await open();

    expect(await screen.findByRole('header', { name: 'How Lena looks' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save look' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Oval' })).toBeChecked();
  });

  it('lets the learner try each expression, and make the portrait speak', async () => {
    await open();
    await screen.findByRole('header', { name: 'How Lena looks' });

    await fireEvent.press(screen.getByRole('radio', { name: 'Surprised' }));
    expect(screen.getByRole('radio', { name: 'Surprised' })).toBeChecked();

    await fireEvent.press(screen.getByRole('button', { name: 'Make them speak' }));
    expect(screen.getByRole('button', { name: 'Stop speaking' })).toBeTruthy();
    // Trying things out changes nothing that is saved.
    expect(screen.getByRole('button', { name: 'Save look' })).toBeDisabled();
  });

  it('saves the new face, eyes and age lines as the look and nothing else', async () => {
    const api = await open();
    await screen.findByRole('header', { name: 'How Lena looks' });

    await fireEvent.press(screen.getByRole('radio', { name: 'Round' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Green' }));
    await fireEvent.press(screen.getByRole('switch', { name: 'Age lines' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save look' }));

    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(savedLooks(api)).toEqual([
      [LENA.id, { look: { ...LENA.look, face: 'round', eyes: 'green', aged: true } }],
    ]);
    expect(screen.getByRole('button', { name: 'Save look' })).toBeDisabled();
  });

  it('says so when the look could not be saved, and keeps the choices', async () => {
    const api = await open();
    await screen.findByRole('header', { name: 'How Lena looks' });
    api.failNext('changePersona', 'network');

    await fireEvent.press(screen.getByRole('radio', { name: 'Narrow' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save look' }));

    expect(await screen.findByText(/Can’t reach Konvami/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Narrow' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save look' })).toBeEnabled();
  });

  it('says so when the partner is no longer there', async () => {
    await open('aaaaaaaa-aaaa-4aaa-8aaa-999999999999');

    expect(await screen.findByText('This partner is no longer there.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save look' })).toBeNull();
  });
});
