import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_PERSONAS, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { RolePlaysScreen } from '.';

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

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

async function open(api: FakeApi = inApp()) {
  await renderScreen(<RolePlaysScreen />, { api, signedIn: true });
  await screen.findByRole('header', { name: 'Role-plays' });
  await waitFor(() => expect(screen.queryByText('Loading the role-plays')).toBeNull());
  return api;
}

describe('5.13 Role-plays', () => {
  it('lists the situations of the language learned, easiest first, with their level', async () => {
    await open();

    const rows = screen.getAllByRole('button', { name: /, from level / });
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'At the bakery, from level A1',
      'At the doctor’s, from level A2',
      'At the pharmacy, from level A2',
      'At the station, from level A2',
      'Registering your address, from level B1',
      'Viewing a flat, from level B1',
      'Job interview, from level B1',
      'Making a complaint, from level B1',
    ]);
  });

  it('shows a situation with its goals and starts it with the partner chosen', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'At the bakery, from level A1' }));

    expect(await screen.findByRole('button', { name: 'Start the role-play' })).toBeTruthy();
    // In the sheet, as in the list under it.
    expect(screen.getAllByText('Buy bread and something sweet for breakfast.')).toHaveLength(2);
    expect(screen.getByText('Order two things')).toBeTruthy();
    expect(screen.getByText('Ask the price')).toBeTruthy();
    expect(screen.getByText('Pay and say goodbye')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Lena' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Jonas' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start the role-play' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/call/[personaId]',
      params: { personaId: FAKE_PERSONAS[1]!.id, scenario: 'bakery' },
    });
  });

  it('says so when the role-plays cannot be loaded, and loads them again', async () => {
    const api = inApp();
    api.failNext('getCatalog', 'network');
    await renderScreen(<RolePlaysScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('button', { name: 'At the bakery, from level A1' }),
    ).toBeTruthy();
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<RolePlaysScreen />, { api: inApp() });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
