import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { createTestAuth, renderScreen } from '@/test/render';
import { ProfileScreen } from '.';

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

// The photo is decorative; the tests look at what is drawn.
const DRAWN = { includeHiddenElements: true };

function inApp(options?: Parameters<FakeApi['enterApp']>[0]): FakeApi {
  const api = createFakeApi();
  api.enterApp(options);
  return api;
}

async function open(api: FakeApi = inApp()) {
  const view = await renderScreen(<ProfileScreen />, { api, signedIn: true });
  await screen.findByText('2 partners');
  return view;
}

describe('6.1 Profile', () => {
  it('shows who is signed in', async () => {
    await open();

    expect(screen.getByRole('header', { name: 'Profile' })).toBeTruthy();
    expect(screen.getByText('Amara')).toBeTruthy();
    expect(screen.getByText('amara.diallo@mail.com')).toBeTruthy();
    // No photo yet: the first letter of the name stands in.
    expect(screen.getByText('A', DRAWN)).toBeTruthy();
  });

  it('shows the learner’s photo once they have one', async () => {
    const api = inApp();
    api.havePicture();

    await open(api);

    expect(await screen.findByTestId('user-photo-image', DRAWN)).toHaveProp('source', {
      uri: 'https://files.test/users/amara/picture/earlier.jpg',
    });
  });

  it('says what they are learning and at which level', async () => {
    await open(inApp({ measured: true }));

    expect(screen.getByText('Learning German')).toBeTruthy();
    expect(screen.getByText('B1')).toBeTruthy();
    expect(screen.getByText('Measured')).toBeTruthy();
  });

  it('adds up their practice from what really happened', async () => {
    const api = inApp();
    api.talked(0, { daysAgo: 0, minutes: 7 });
    api.talked(1, { daysAgo: 1, minutes: 5 });

    await open(api);

    expect(screen.getByLabelText('Day streak: 2')).toBeTruthy();
    expect(screen.getByLabelText('Conversations: 2')).toBeTruthy();
    expect(screen.getByLabelText('Minutes talked: 12')).toBeTruthy();
  });

  it('shows no practice numbers to someone who has not talked yet', async () => {
    await open();

    expect(screen.getByLabelText('Conversations: 0')).toBeTruthy();
    expect(screen.getByLabelText('Day streak: 0')).toBeTruthy();
  });

  it.each([
    ['Personal', '/account/personal'],
    ['Learning', '/account/learning'],
    ['My partners', '/account/partners'],
    ['New partner', '/account/partners/new'],
    ['What my partners know', '/account/memory'],
    ['Privacy and AI', '/account/privacy'],
    ['Security', '/account/security'],
  ])('leads to %s', async (row, route) => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: row }));

    expect(router.push).toHaveBeenCalledWith(route);
  });

  it('shows the voice minutes left this week and when they come back', async () => {
    const api = inApp();
    api.usedMinutes(15);

    await open(api);

    expect(await screen.findByText('45 minutes left')).toBeTruthy();
    expect(screen.getByText('of 60 this week')).toBeTruthy();
    expect(screen.getByLabelText('45 of 60 voice minutes left this week')).toBeTruthy();
    expect(screen.getByText('They come back on Monday, October 12.')).toBeTruthy();
  });

  it('says so when the week’s minutes are used up', async () => {
    const api = inApp();
    api.usedMinutes(60);

    await open(api);

    expect(await screen.findByText('0 minutes left')).toBeTruthy();
    expect(
      screen.getByText('This week’s minutes are used up. They come back on Monday, October 12.'),
    ).toBeTruthy();
  });

  it('shows the way to the costs to the owner only', async () => {
    await open();
    await screen.findByText(/minutes left/);
    expect(screen.queryByRole('button', { name: 'Costs' })).toBeNull();
  });

  it('leads the owner to the costs', async () => {
    const api = inApp();
    api.beOwner();
    await open(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'Costs' }));

    expect(router.push).toHaveBeenCalledWith('/account/costs');
  });

  it('still shows the account and its rows when the practice could not be loaded', async () => {
    const api = inApp();
    api.failNext('getHome', 'network');

    await renderScreen(<ProfileScreen />, { api, signedIn: true });

    expect(await screen.findByRole('button', { name: 'My partners' })).toBeTruthy();
    expect(screen.getByText('Amara')).toBeTruthy();
    expect(screen.queryByLabelText(/Day streak/)).toBeNull();
  });

  it('goes back to where the learner came from', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(router.back).toHaveBeenCalled();
  });

  it('signs out, forgets what was loaded and returns to Welcome', async () => {
    const auth = await createTestAuth();
    const api = inApp();
    await renderScreen(<ProfileScreen />, { auth, api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/welcome'));
    expect(auth.session.getState().status).toBe('signedOut');
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<ProfileScreen />);

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
