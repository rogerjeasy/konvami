import { fireEvent, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { createFakePurchaseDevice, FAKE_OFFERS } from '@/test/fake-purchase-device';
import { renderScreen } from '@/test/render';
import { TrialOffer } from './trial-offer';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: () => null,
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

describe('4.8 Ready: the free trial', () => {
  it('offers the days the store gives, and opens the plans', async () => {
    await renderScreen(<TrialOffer />, {
      api: inApp(),
      signedIn: true,
      purchases: createFakePurchaseDevice(),
    });

    expect(await screen.findByText('Try Plus free for 7 days')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'See the offer' }));

    expect(await screen.findByText('Choose a plan')).toBeTruthy();
    expect(screen.getByText('Try Plus free. Cancel any time in your store account.')).toBeTruthy();
  });

  async function offersNothing(api: FakeApi, store = createFakePurchaseDevice()) {
    await renderScreen(<TrialOffer />, { api, signedIn: true, purchases: store });
    // Long enough for the plan and the store's offers to have been read.
    await new Promise((done) => setTimeout(done, 50));
    expect(screen.queryByText(/Try Plus free for/)).toBeNull();
  }

  it('offers nothing where the store has no free days', async () => {
    const store = createFakePurchaseDevice();
    store.stock = FAKE_OFFERS.map((offer) => ({ ...offer, trialDays: null }));

    await offersNothing(inApp(), store);
  });

  it('offers nothing while plans are not enforced', async () => {
    const api = inApp();
    api.hasPlan({ enforced: false });

    await offersNothing(api);
  });

  it('offers nothing to a learner who already has a plan', async () => {
    const api = inApp();
    api.hasPlan({ tier: 'plus' });

    await offersNothing(api);
  });

  it('offers nothing where nothing can be bought', async () => {
    await offersNothing(inApp(), createFakePurchaseDevice(false));
  });
});
