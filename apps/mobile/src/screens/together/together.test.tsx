import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_PERSONAS, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { TogetherScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useFocusEffect: jest.fn(),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

async function open(api: FakeApi) {
  await renderScreen(<TogetherScreen />, { api, signedIn: true });
  await screen.findByRole('header', { name: 'Two partners at once' });
}

describe('5.24 Choose two partners', () => {
  it('starts a conversation with the two partners picked, the first one leading', async () => {
    const api = createFakeApi();
    api.enterApp();
    await open(api);
    const [lena, jonas] = FAKE_PERSONAS;
    const start = await screen.findByRole('button', { name: 'Pick two partners' });
    expect(start).toBeDisabled();

    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(jonas!.name) }));
    expect(screen.getByText('Leads')).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(lena!.name) }));
    expect(screen.getByText('Joins')).toBeTruthy();

    await fireEvent.press(
      screen.getByRole('button', { name: `Talk with ${jonas!.name} and ${lena!.name}` }),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/call/[personaId]',
      params: { personaId: jonas!.id, guest: lena!.id },
    });
  });

  it('unpicks a partner when tapped again, and never holds more than two', async () => {
    const api = createFakeApi();
    api.enterApp();
    await open(api);
    const [lena] = FAKE_PERSONAS;
    const box = await screen.findByRole('checkbox', { name: new RegExp(lena!.name) });

    await fireEvent.press(box);
    await fireEvent.press(box);

    expect(screen.queryByText('Leads')).toBeNull();
  });
});
