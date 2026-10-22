import { fireEvent, screen } from '@testing-library/react-native';
import { createFakeApi, FAKE_COSTS, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { CostsScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

function owner(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  api.beOwner();
  return api;
}

async function open(api: FakeApi = owner()) {
  await renderScreen(<CostsScreen />, { api, signedIn: true });
  await screen.findByText('October 2026');
}

describe('6.12 Costs', () => {
  it('shows the month’s estimated spend against the target and the ceiling', async () => {
    await open();

    expect(screen.getByRole('header', { name: 'Costs' })).toBeTruthy();
    // The total, and the one provider's share of it.
    expect(screen.getAllByText('$162.40')).toHaveLength(2);
    expect(screen.getByText('$150.00 target · voice stops at $250.00')).toBeTruthy();
    expect(screen.getByLabelText('$162.40 of the $150.00 target')).toBeTruthy();
    expect(screen.getByText('Past the target: new calls use the cheaper voice model')).toBeTruthy();
  });

  it('draws every day of the month and reads out the one chosen', async () => {
    await open();

    const chart = screen.getByRole('adjustable', { name: 'Per day' });
    // The last day with spending is read out first.
    expect(screen.getByText('Oct 9: $32.70')).toBeTruthy();
    expect(chart).toHaveAccessibilityValue({ text: 'Oct 9: $32.70' });

    // A screen reader steps back a day.
    await fireEvent(chart, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(screen.getByText('Oct 8: $88.50')).toBeTruthy();

    // A tap picks the day under the finger: 31 days across 310 pt are 10 pt each, so 75 pt is the 8th.
    await fireEvent(chart, 'layout', { nativeEvent: { layout: { width: 310, height: 96 } } });
    await fireEvent.press(chart, { nativeEvent: { locationX: 5 } });
    expect(screen.getByText('Oct 1: $0.00')).toBeTruthy();
    await fireEvent.press(chart, { nativeEvent: { locationX: 75 } });
    expect(screen.getByText('Oct 8: $88.50')).toBeTruthy();
  });

  it('shares the spend out by feature, provider and learner', async () => {
    await open();

    expect(screen.getByText('Conversations')).toBeTruthy();
    expect(screen.getByText('$120.10')).toBeTruthy();
    expect(screen.getByText('Reports’ second check')).toBeTruthy();
    expect(screen.getByText('OpenAI')).toBeTruthy();
    expect(screen.getByText('Amara')).toBeTruthy();
    expect(screen.getByText('360 voice min · 410 requests')).toBeTruthy();
    // A learner whose account is gone is told apart by the start of its id.
    expect(screen.getByText('No name (account 22222222)')).toBeTruthy();
  });

  it('goes back a month, and forward again up to this one', async () => {
    const api = owner();
    await open(api);
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));

    expect(await screen.findByText('September 2026')).toBeTruthy();
    expect(screen.getByText('Nothing was spent this month.')).toBeTruthy();
    expect(api.calls).toContainEqual(['getCosts', '2026-09-01']);

    await fireEvent.press(screen.getByRole('button', { name: 'Next month' }));

    expect(await screen.findAllByText('$162.40')).toHaveLength(2);
  });

  it('says when some requests had no price', async () => {
    const api = owner();
    api.spent({ ...FAKE_COSTS, unpriced: 3 });

    await open(api);

    expect(
      screen.getByText('3 requests used a model without a price, so the total is too low.'),
    ).toBeTruthy();
  });

  it('shows nothing to an account that is not the owner’s', async () => {
    const api = createFakeApi();
    api.enterApp();

    await renderScreen(<CostsScreen />, { api, signedIn: true });

    expect(await screen.findByText('Only the owner’s account can see the costs.')).toBeTruthy();
  });

  it('offers another try when the costs cannot be read', async () => {
    const api = owner();
    api.failNext('getCosts', 'network');
    await renderScreen(<CostsScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findAllByText('$162.40')).toHaveLength(2);
  });
});
