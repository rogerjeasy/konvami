import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_PERSONAS, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { TalkScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), navigate: jest.fn() },
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

function inApp(options?: Parameters<FakeApi['enterApp']>[0]): FakeApi {
  const api = createFakeApi();
  api.enterApp(options);
  return api;
}

async function open(api: FakeApi = inApp()) {
  await renderScreen(<TalkScreen />, { api, signedIn: true });
  await screen.findByRole('header', { name: 'Who do you want to talk to?' });
  await screen.findByText('Lena');
  return api;
}

describe('5.2 Talk', () => {
  it('lists the learner’s partners with who they are', async () => {
    await open();

    expect(screen.getByText('Lena')).toBeTruthy();
    expect(screen.getByText('Friend')).toBeTruthy();
    expect(screen.getByText('27 · Berlin')).toBeTruthy();
    // Lena has no line of her own, so her role's line stands in.
    expect(screen.getByText('Easy chats about everyday life.')).toBeTruthy();
    expect(screen.getByText('Jonas')).toBeTruthy();
    expect(screen.getByText('Clear explanations and plenty of patience.')).toBeTruthy();
  });

  it('includes the exam coach of a learner who is preparing an exam', async () => {
    await open(inApp({ exam: { type: 'goethe', target_level: 'B1', date: null } }));

    expect(screen.getByText('Frau Weber')).toBeTruthy();
    expect(screen.getByText('Exam coach')).toBeTruthy();
  });

  it('says when the learner last talked to each partner, or that they have not yet', async () => {
    const api = inApp();
    api.talked(1, { daysAgo: 1 });
    await open(api);

    expect(screen.getByText('Last talked yesterday')).toBeTruthy();
    expect(screen.getByText('You haven’t talked yet')).toBeTruthy();
  });

  it('starts a conversation with the partner that is chosen', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Talk with Jonas' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/call/[personaId]',
      params: { personaId: FAKE_PERSONAS[1]?.id },
    });
  });

  it('leads to designing a new partner', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'New partner' }));

    expect(router.push).toHaveBeenCalledWith('/account/partners/new');
  });

  it('leads to changing the partners', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit my partners' }));

    expect(router.push).toHaveBeenCalledWith('/account/partners');
  });

  it('says so when the partners cannot be loaded and tries again', async () => {
    const api = inApp();
    api.failNext('getHome', 'network');
    await renderScreen(<TalkScreen />, { api, signedIn: true });

    expect(
      await screen.findByText('Can’t reach Konvami. Check your connection and try again.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Lena')).toBeTruthy();
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<TalkScreen />, { api: inApp() });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
