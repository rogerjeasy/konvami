import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_SUBSCRIPTION, type FakeApi } from '@/test/fake-api';
import { createFakePurchaseDevice, type FakePurchaseDevice } from '@/test/fake-purchase-device';
import { renderScreen } from '@/test/render';
import { PlanScreen } from './index';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

const mockOpenLink = jest.fn();
jest.mock('@/lib/external', () => ({
  openLink: (url: string) => mockOpenLink(url),
  openAppSettings: jest.fn(),
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

async function open(
  api: FakeApi = inApp(),
  store: FakePurchaseDevice = createFakePurchaseDevice(),
) {
  await renderScreen(<PlanScreen />, { api, signedIn: true, purchases: store });
  return { api, store };
}

describe('6.17 Plan', () => {
  it('names the plan, what it includes and the minutes left', async () => {
    await open();

    expect(await screen.findByRole('header', { name: 'Free' })).toBeTruthy();
    expect(screen.getByText('15 voice minutes a week')).toBeTruthy();
    expect(screen.getByText('Up to 2 partners')).toBeTruthy();
    expect(screen.getByText('60 minutes left')).toBeTruthy();
  });

  it('says when a free trial ends, and shows Plus with its extras listed', async () => {
    const api = inApp();
    api.hasPlan({
      tier: 'plus',
      trial: true,
      autoRenew: true,
      expiresAt: '2026-10-16T00:00:00Z',
      weeklySeconds: 3600,
    });
    await open(api);

    expect(await screen.findByRole('header', { name: 'Plus' })).toBeTruthy();
    expect(screen.getByText('Free trial')).toBeTruthy();
    expect(screen.getByText('Your free trial ends on October 16, 2026.')).toBeTruthy();
    expect(screen.getByText('As many partners as you like')).toBeTruthy();
  });

  it('says a cancelled plan will not renew, and that a payment failed', async () => {
    const api = inApp();
    api.hasPlan({
      tier: 'plus',
      autoRenew: false,
      billingIssue: true,
      expiresAt: '2026-11-02T00:00:00Z',
    });
    await open(api);

    expect(await screen.findByText('Ends on November 2, 2026. It won’t renew.')).toBeTruthy();
    expect(screen.getByText(/couldn’t take your last payment/)).toBeTruthy();
  });

  it('says every feature is open while plans are not enforced, and offers nothing to buy', async () => {
    const api = inApp();
    api.hasPlan({ enforced: false, weeklySeconds: 3600 });
    await open(api);

    expect(
      await screen.findByText(
        'While Konvami is in testing, every feature is open and you have 60 voice minutes a week.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'See plans' })).toBeNull();
  });

  it('offers the plans from the store, with its prices and the free days of its trial', async () => {
    await open();

    await fireEvent.press(await screen.findByRole('button', { name: 'See plans' }));

    expect(await screen.findByText('Choose a plan')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /CHF 14\.90 · per month/ })).toBeTruthy();
    expect(screen.getByText('7 days free')).toBeTruthy();
    expect(screen.getByRole('button', { name: /CHF 99\.00 · per year/ })).toBeTruthy();
    expect(screen.getByText('Scored exam simulations')).toBeTruthy();
    expect(screen.getByRole('button', { name: /60 voice minutes/ })).toBeTruthy();
  });

  it('buys what is chosen and reads the plan again until the server knows', async () => {
    const api = inApp();
    const { store } = await open(api);
    await fireEvent.press(await screen.findByRole('button', { name: 'See plans' }));

    await fireEvent.press(await screen.findByRole('button', { name: /CHF 14\.90 · per month/ }));

    await waitFor(() => expect(store.log).toContain('purchase plus/$rc_monthly'));
    await waitFor(() => expect(screen.queryByText('Choose a plan')).toBeNull());
  });

  it('keeps the sheet open and says so when the store fails', async () => {
    const store = createFakePurchaseDevice();
    store.result = 'fails';
    await open(inApp(), store);
    await fireEvent.press(await screen.findByRole('button', { name: 'See plans' }));

    await fireEvent.press(await screen.findByRole('button', { name: /CHF 14\.90 · per month/ }));

    expect(
      await screen.findByText('The purchase didn’t go through. Please try again.'),
    ).toBeTruthy();
    expect(screen.getByText('Choose a plan')).toBeTruthy();
  });

  it('does nothing when the learner backs out of the store’s sheet', async () => {
    const store = createFakePurchaseDevice();
    store.result = 'cancelled';
    await open(inApp(), store);
    await fireEvent.press(await screen.findByRole('button', { name: 'See plans' }));

    await fireEvent.press(await screen.findByRole('button', { name: /CHF 14\.90 · per month/ }));

    await waitFor(() => expect(store.log).toContain('purchase plus/$rc_monthly'));
    expect(screen.getByText('Choose a plan')).toBeTruthy();
    expect(screen.queryByText('The purchase didn’t go through. Please try again.')).toBeNull();
  });

  it('names the learner to the store, and restores purchases on request', async () => {
    const { store } = await open();

    await waitFor(() => expect(store.log).toContain(`signIn ${FAKE_SUBSCRIPTION.userId}`));
    await fireEvent.press(await screen.findByRole('button', { name: 'Restore purchases' }));

    expect(await screen.findByText('Purchases restored.')).toBeTruthy();
    expect(store.log).toContain('restore');
  });

  it('opens the store’s page for a subscription that is bought, and only then', async () => {
    const api = inApp();
    api.hasPlan({ tier: 'plus', autoRenew: true, expiresAt: '2026-11-02T00:00:00Z' });
    await open(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'Manage subscription' }));

    await waitFor(() =>
      expect(mockOpenLink).toHaveBeenCalledWith(expect.stringContaining('apple.com')),
    );
  });

  it('has no manage link on the free plan', async () => {
    await open();

    await screen.findByRole('header', { name: 'Free' });
    expect(screen.queryByRole('button', { name: 'Manage subscription' })).toBeNull();
  });

  it('says plans are bought in the phone app where this build cannot sell', async () => {
    await open(inApp(), createFakePurchaseDevice(false));

    expect(await screen.findByText(/can’t sell them/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'See plans' })).toBeNull();
  });
});
