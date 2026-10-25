import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { GoalsScreen } from './goals';
import { LearningScreen } from './learning';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
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

async function open(ui: React.ReactElement, api: FakeApi = inApp()) {
  await renderScreen(ui, { api, signedIn: true });
  await waitFor(() => expect(screen.queryByText('Getting things ready')).toBeNull());
  return api;
}

const saved = (api: FakeApi) =>
  api.calls.filter(([method]) => method === 'updateProfile').map(([, changes]) => changes);

describe('6.3 Your goals', () => {
  it('reads the goals back on 6.3, the suggested habit marked as such', async () => {
    await open(<LearningScreen />);

    expect(screen.getByRole('header', { name: 'Your goals' })).toBeTruthy();
    expect(screen.getByText('4 days, 40 min a week')).toBeTruthy();
    expect(screen.getByText('Suggested')).toBeTruthy();
    expect(screen.getByText('Not set')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Change: Every week' }));

    expect(router.push).toHaveBeenCalledWith('/account/goals');
  });

  it('reads back a level goal with its date', async () => {
    const api = inApp();
    api.answer([
      { field: 'weekly_habit', value: { days: 3, minutes: 30 } },
      { field: 'level_goal', value: { level: 'B1', by: '2027-03-31' } },
    ]);
    await open(<LearningScreen />, api);

    expect(screen.getByText('3 days, 30 min a week')).toBeTruthy();
    expect(screen.getByText('B1 by March 31, 2027')).toBeTruthy();
  });

  it('saves a weekly habit and a level to reach, then goes back to 6.3', async () => {
    const api = await open(<GoalsScreen today={new Date(2026, 9, 9)} />);

    expect(
      await screen.findByText(
        'During testing you have 60 voice minutes a week. A plan never asks for more.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: '4 days' }).props.accessibilityState.checked).toBe(
      true,
    );
    await fireEvent.press(screen.getByRole('radio', { name: '3 days' }));
    await fireEvent.press(screen.getByRole('radio', { name: '30 min' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'B1' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(saved(api)).toEqual([
        [
          { field: 'weekly_habit', value: { days: 3, minutes: 30 } },
          { field: 'level_goal', value: { level: 'B1', by: null } },
        ],
      ]),
    );
    expect(router.back).toHaveBeenCalled();
  });

  it('offers only levels above the learner’s own, and no level at all', async () => {
    const api = inApp();
    api.answer([{ field: 'level_goal', value: { level: 'B2', by: null } }]);
    await open(<GoalsScreen />, api);

    expect(screen.queryByRole('radio', { name: 'A2' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'None' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saved(api)[0]).toContainEqual({ field: 'level_goal', value: null }));
  });
});
