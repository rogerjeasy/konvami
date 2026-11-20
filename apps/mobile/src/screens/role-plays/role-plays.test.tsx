import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_PERSONAS, FAKE_SCENE, type FakeApi } from '@/test/fake-api';
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

  it('rehearses an event of the learner’s life with the partner who heard about it', async () => {
    const api = inApp();
    api.lifeEvents({
      comingUp: [
        {
          memoryId: 'm-1',
          text: 'Has a job interview',
          day: '2026-10-12',
          partnerId: FAKE_PERSONAS[1]!.id,
          rehearsal: null,
          done: false,
        },
      ],
    });
    await open(api);

    expect(await screen.findByRole('header', { name: 'Coming up in your life' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Rehearse Has a job interview/ }));

    // A rehearsal written without the model names its goals in the app's language.
    expect(await screen.findByText('Ask a question you need answered')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Jonas' })).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Start the role-play' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/call/[personaId]',
      params: { personaId: FAKE_PERSONAS[1]!.id, scenario: 'own-cdcdcdcdcdcd4dcd8dcd000000000001' },
    });
  });

  it('talks over an event that happened in a debrief call', async () => {
    const api = inApp();
    api.lifeEvents({
      toDebrief: [
        {
          memoryId: 'aaaa-bbbb',
          text: 'Went to a party',
          day: '2026-10-07',
          partnerId: null,
          rehearsal: null,
          done: false,
        },
      ],
    });
    await open(api);

    await fireEvent.press(
      await screen.findByRole('button', { name: /^Talk over Went to a party/ }),
    );

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/call/[personaId]',
      params: { personaId: FAKE_PERSONAS[0]!.id, practise: 'debrief:aaaabbbb' },
    });
  });

  it('lists the learner’s own role-plays and plays, edits or deletes one', async () => {
    const api = inApp();
    api.keptScenes([
      {
        id: 'own-1',
        scenario: 'own-own1',
        scene: FAKE_SCENE,
        source: 'custom',
        memoryId: null,
        updatedAt: '2026-10-09T12:00:00Z',
      },
    ]);
    await open(api);

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Returning a coat, from level A2' }),
    );
    expect(await screen.findByText('A friendly shop assistant')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/own-scenario',
      params: { id: 'own-1' },
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Returning a coat, from level A2' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Returning a coat, from level A2' })).toBeNull(),
    );
    expect(api.calls).toContainEqual(['removeOwnScenario', 'own-1']);
  });

  it('leads to creating a scenario', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Create a scenario' }));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/own-scenario', params: {} });
  });
});
