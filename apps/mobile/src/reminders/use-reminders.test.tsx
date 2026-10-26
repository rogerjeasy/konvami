import { act, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { setReminders } from '@/preferences';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { createFakeReminderDevice, type FakeReminderDevice } from '@/test/fake-reminder-device';
import { createTestAuth, renderScreen } from '@/test/render';
import { DEFAULT_REMINDERS } from './schedule';
import { ReminderKeeper } from './use-reminders';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
}));

beforeEach(async () => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
  await setReminders(null);
});

const pushCalls = (api: FakeApi) =>
  api.calls.filter(([method]) => method === 'registerPushDevice' || method === 'removePushDevice');

async function keep(device: FakeReminderDevice, api = createFakeApi()) {
  const auth = await createTestAuth();
  await renderScreen(<ReminderKeeper />, { auth, api, reminders: device, signedIn: true });
  return { auth, api };
}

describe('the reminders, for the whole app', () => {
  it.each([
    [
      { open: 'card', id: 'card_word' },
      { pathname: '/learn', params: { card: 'card_word' } },
    ],
    [
      { open: 'report', id: 'rtc_1' },
      { pathname: '/conversations/[id]/report', params: { id: 'rtc_1' } },
    ],
    [
      { open: 'simulation', id: 'rtc_2' },
      { pathname: '/exams/simulations/[id]', params: { id: 'rtc_2' } },
    ],
    [{ open: 'today' }, '/today'],
  ] as const)('open what a tapped reminder or push is about', async (target, route) => {
    const device = createFakeReminderDevice('granted');
    await keep(device);

    await act(async () => device.tap(target));

    expect(router.navigate).toHaveBeenCalledWith(route);
  });

  it('let the server reach the phone while reminders are on, and not once they are off', async () => {
    await setReminders(DEFAULT_REMINDERS);
    const { api } = await keep(createFakeReminderDevice('granted'));

    await waitFor(() => expect(pushCalls(api)).toHaveLength(1));
    expect(pushCalls(api)[0]).toEqual([
      'registerPushDevice',
      {
        token: 'ExponentPushToken[fake-phone]',
        platform: 'ios',
        timeZone: 'Europe/Zurich',
        language: 'en',
        time: '18:00',
      },
    ]);

    await act(() => setReminders({ ...DEFAULT_REMINDERS, on: false }));

    await waitFor(() =>
      expect(pushCalls(api).at(-1)).toEqual(['removePushDevice', 'ExponentPushToken[fake-phone]']),
    );
  });

  it('do not register a phone that does not allow notifications or has no address', async () => {
    await setReminders(DEFAULT_REMINDERS);
    const denied = await keep(createFakeReminderDevice('denied'));
    const none = createFakeReminderDevice('granted');
    none.token = null;
    const without = await keep(none);

    await act(async () => {});

    expect(pushCalls(denied.api)).toEqual([]);
    expect(pushCalls(without.api)).toEqual([]);
  });

  it('take the phone back from the server before signing out, then every reminder', async () => {
    await setReminders(DEFAULT_REMINDERS);
    const device = createFakeReminderDevice('granted');
    device.scheduled = [{ id: 'reminder-2026-10-10', at: new Date(), title: 'Lena', body: '…' }];
    const { auth, api } = await keep(device);

    await act(() => auth.session.signOut());

    expect(pushCalls(api).at(-1)).toEqual(['removePushDevice', 'ExponentPushToken[fake-phone]']);
    await waitFor(() => expect(device.scheduled).toEqual([]));
  });
});
