import { act, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { createFakeReminderDevice } from '@/test/fake-reminder-device';
import { createTestAuth, renderScreen } from '@/test/render';
import { ReminderKeeper } from './use-reminders';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
}));

describe('the reminders, for the whole app', () => {
  it('open Today when one is tapped', async () => {
    const device = createFakeReminderDevice('granted');
    await renderScreen(<ReminderKeeper />, { reminders: device, signedIn: true });

    await act(async () => device.tap());

    expect(router.navigate).toHaveBeenCalledWith('/today');
  });

  it('are all taken back once the learner signs out', async () => {
    const auth = await createTestAuth();
    const device = createFakeReminderDevice('granted');
    device.scheduled = [{ id: 'reminder-2026-10-10', at: new Date(), title: 'Lena', body: '…' }];
    await renderScreen(<ReminderKeeper />, { auth, reminders: device, signedIn: true });

    await act(() => auth.session.signOut());

    await waitFor(() => expect(device.scheduled).toEqual([]));
  });
});
