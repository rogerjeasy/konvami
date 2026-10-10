import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { getPreferences, setLanguage } from '@/preferences';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { createFakeProfileDevice, FAKE_PICTURE } from '@/test/fake-profile-device';
import { createTestAuth, renderScreen } from '@/test/render';
import { PersonalScreen } from './personal';

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

afterEach(async () => {
  await setLanguage(null);
});

const DRAWN = { includeHiddenElements: true };

async function open({ api = createFakeApi() }: { api?: FakeApi } = {}) {
  const auth = await createTestAuth();
  const device = createFakeProfileDevice();
  await renderScreen(<PersonalScreen />, { auth, api, device, signedIn: true });
  await screen.findByRole('header', { name: 'Personal' });
  return { auth, api, device };
}

describe('6.2 Personal', () => {
  it('shows the name and the email of the account', async () => {
    await open();

    expect(screen.getByLabelText('First name')).toHaveProp('value', 'Amara');
    expect(screen.getByText('amara.diallo@mail.com')).toBeTruthy();
  });

  it('saves a new first name on the account', async () => {
    const { auth } = await open();
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('First name'), '  Amara Sophie ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(auth.session.getState().user?.firstName).toBe('Amara Sophie');
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
  });

  it('does not save an empty name', async () => {
    await open();

    await fireEvent.changeText(screen.getByLabelText('First name'), '   ');

    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
  });

  it('says so when the name could not be saved, and keeps what was typed', async () => {
    const { auth } = await open();
    auth.provider.failNext('updateName', 'network');

    await fireEvent.changeText(screen.getByLabelText('First name'), 'Amara Sophie');
    await fireEvent.press(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Can’t reach Konvami/);
    expect(screen.getByLabelText('First name')).toHaveProp('value', 'Amara Sophie');
    expect(auth.session.getState().user?.firstName).toBe('Amara');
  });

  it('sends a chosen photo and shows it', async () => {
    const { api, device } = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo' }));

    const [uploadId] = await waitFor(() => {
      expect(api.uploads).toHaveLength(1);
      return api.uploads;
    });
    expect(await screen.findByTestId('user-photo-image', DRAWN)).toHaveProp('source', {
      uri: `https://files.test/users/amara/picture/${uploadId}.jpg`,
    });
    expect(device.sent[0]?.picture).toEqual(FAKE_PICTURE);
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeTruthy();
  });

  it('changes nothing when the learner closes the picker', async () => {
    const { api, device } = await open();
    device.nextPick({ status: 'cancelled' });

    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Choose a photo' })).not.toBeBusy(),
    );
    expect(api.uploads).toHaveLength(0);
    expect(screen.queryByText(/couldn’t/)).toBeNull();
  });

  it('says so when a picture cannot be used', async () => {
    const { device } = await open();
    device.nextPick({ status: 'failed' });

    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo' }));

    expect(await screen.findByText('That picture couldn’t be used. Try another one.')).toBeTruthy();
  });

  it('keeps the old photo when the new one could not be sent', async () => {
    const api = createFakeApi();
    api.havePicture();
    const { device } = await open({ api });
    await screen.findByTestId('user-photo-image', DRAWN);
    device.failNextSend('network');

    await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));

    expect(await screen.findByText(/Your photo couldn’t be sent/)).toBeTruthy();
    expect(screen.getByTestId('user-photo-image', DRAWN)).toHaveProp('source', {
      uri: 'https://files.test/users/amara/picture/earlier.jpg',
    });
  });

  it('removes the photo', async () => {
    const api = createFakeApi();
    api.havePicture();
    await open({ api });

    await fireEvent.press(await screen.findByRole('button', { name: 'Remove photo' }));

    expect(await screen.findByRole('button', { name: 'Choose a photo' })).toBeTruthy();
    expect(screen.queryByTestId('user-photo-image', DRAWN)).toBeNull();
    expect((await api.getAccount()).picture).toBeNull();
  });

  it('changes the app language on this device and on the account', async () => {
    const { auth } = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'App language' }));
    await fireEvent.press(await screen.findByRole('radio', { name: 'Français' }));

    await waitFor(() => expect(getPreferences().language).toBe('fr'));
    await waitFor(() =>
      expect(
        auth.provider.calls.some(
          ([method, , locale]) => method === 'updateLocale' && locale === 'fr',
        ),
      ).toBe(true),
    );
  });

  it('leads to changing the email', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Email' }));

    expect(router.push).toHaveBeenCalledWith('/account/security/email');
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<PersonalScreen />);

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
