import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_PERSONAS, type FakeApi } from '@/test/fake-api';
import { createFakeReminderDevice } from '@/test/fake-reminder-device';
import { renderScreen } from '@/test/render';
import { IncomingCallScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

const LENA = FAKE_PERSONAS[0]!;
// The device's clock: Friday 9 October 2026, 18:00.
const NOW = new Date(2026, 9, 9, 18, 0);

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

async function ring(params: Record<string, string>, device = createFakeReminderDevice('granted')) {
  jest.mocked(useLocalSearchParams).mockReturnValue(params);
  await renderScreen(<IncomingCallScreen />, {
    api: inApp(),
    signedIn: true,
    reminders: device,
    now: NOW,
  });
  await screen.findByRole('header', { name: 'Lena is calling' });
  return device;
}

describe('5.28 A partner is calling', () => {
  it('says who rings and what about, and answering starts a short call with them', async () => {
    await ring({ partner: LENA.id, ask: 'How did the interview go?' });

    expect(screen.getByText('A short call, about 3 minutes')).toBeTruthy();
    expect(screen.getByText('About: How did the interview go?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Answer' }));

    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/call/[personaId]',
      params: { personaId: LENA.id, rang: '1' },
    });
  });

  it('goes to Today on "Not now"', async () => {
    await ring({ partner: LENA.id });

    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

    expect(router.dismissTo).toHaveBeenCalledWith('/today');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('rings once more in an hour when asked, and says when', async () => {
    const device = await ring({ partner: LENA.id, ask: 'How did the interview go?' });

    await fireEvent.press(screen.getByRole('button', { name: 'Remind me in an hour' }));

    expect(await screen.findByText(/Lena will try again at/)).toBeTruthy();
    expect(device.snoozed).toEqual([
      {
        id: `call-${LENA.id}`,
        at: new Date(2026, 9, 9, 19, 0),
        title: 'Lena is calling',
        body: 'How did the interview go? Tap to answer: about 3 minutes.',
        call: { partner: LENA.id, ask: 'How did the interview go?' },
      },
    ]);
    expect(screen.queryByRole('button', { name: 'Answer' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Today' }));
    expect(router.dismissTo).toHaveBeenCalledWith('/today');
  });

  it('says so calmly when the ring cannot be put off', async () => {
    const device = createFakeReminderDevice('granted');
    device.snooze = async () => {
      throw new Error('no permission');
    };
    await ring({ partner: LENA.id }, device);

    await fireEvent.press(screen.getByRole('button', { name: 'Remind me in an hour' }));

    expect(await screen.findByText('That didn’t work. Try again from Today.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Answer' })).toBeTruthy();
  });

  it('says when the partner who rang is no longer there', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ partner: 'gone' });
    await renderScreen(<IncomingCallScreen />, { api: inApp(), signedIn: true });

    expect(await screen.findByText('This partner is no longer in your list.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Today' }));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/today'));
  });
});
