import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getPreferences, setReminders } from '@/preferences';
import { DEFAULT_REMINDERS } from '@/reminders/schedule';
import { createFakeApi } from '@/test/fake-api';
import { createFakeReminderDevice, type FakeReminderDevice } from '@/test/fake-reminder-device';
import { renderScreen } from '@/test/render';
import { RemindersScreen } from './reminders';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(async () => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
  await setReminders(null);
});

// Friday 9 October 2026 at 9:00 on the device's clock.
const MORNING = new Date(2026, 9, 9, 9, 0);

async function open(reminders: FakeReminderDevice) {
  const api = createFakeApi();
  api.enterApp();
  await renderScreen(<RemindersScreen />, { api, reminders, now: MORNING, signedIn: true });
  await screen.findByRole('header', { name: 'Reminders' });
}

const toggle = (name: string) => screen.getByRole('switch', { name });

describe('6.13 Reminders', () => {
  it('turns reminders on after asking the phone, and says when the next one comes', async () => {
    const device = createFakeReminderDevice('undetermined', 'granted');
    await open(device);
    await screen.findByRole('switch', { name: 'Remind me on my practice days' });

    await fireEvent.press(toggle('Remind me on my practice days'));

    await screen.findByText('Next reminder: Friday 6:00 PM');
    expect(device.asked).toBe(1);
    expect(getPreferences().reminders).toEqual(DEFAULT_REMINDERS);
    expect(device.scheduled[0]?.id).toBe('reminder-2026-10-09');
  });

  it('moves them to the time chosen, and leaves the cards out when asked to', async () => {
    await setReminders(DEFAULT_REMINDERS);
    const device = createFakeReminderDevice('granted');
    await open(device);

    await fireEvent.press(await screen.findByRole('radio', { name: '7:00 AM' }));
    await fireEvent.press(toggle('Also when cards are waiting'));

    expect(getPreferences().reminders).toEqual({
      ...DEFAULT_REMINDERS,
      time: '07:00',
      cards: false,
    });
    await waitFor(() => expect(device.scheduled[0]?.at.getHours()).toBe(7));
    // 7:00 today is gone: the first is Saturday's.
    expect(device.scheduled[0]?.id).toBe('reminder-2026-10-10');
  });

  it('turned off, leaves nothing scheduled', async () => {
    await setReminders(DEFAULT_REMINDERS);
    const device = createFakeReminderDevice('granted');
    await open(device);
    await waitFor(() => expect(device.scheduled.length).toBeGreaterThan(0));

    await fireEvent.press(toggle('Remind me on my practice days'));

    await waitFor(() => expect(device.scheduled).toEqual([]));
    expect(screen.queryByRole('radio', { name: '6:00 PM' })).toBeNull();
  });

  it('says where the phone does not allow notifications, and opens its settings', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await open(createFakeReminderDevice('denied'));

    expect(
      await screen.findByText('Notifications are turned off for Konvami in your phone’s settings.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));

    expect(openSettings).toHaveBeenCalled();
  });

  it('says that reminders come on the phone app, in the browser', async () => {
    await open(createFakeReminderDevice('unsupported'));

    expect(
      await screen.findByText(
        'Reminders come in the Konvami app for iPhone and Android, not in the browser.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
