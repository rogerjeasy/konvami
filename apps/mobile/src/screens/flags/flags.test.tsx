import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { FlagQueueScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

const LENA_LINE = 'Hallo! Wie geht’s dir heute?';

/** An owner and a learner's conversation with a reported line and a reported correction. */
async function reported(): Promise<FakeApi> {
  const api = createFakeApi();
  api.enterApp();
  api.beOwner();
  api.talked(0, { id: 'rtc_1', learnerSays: ['Gut.', 'Ja.'] });
  api.reported('rtc_1');
  await api.flagItem('rtc_1', { kind: 'turn', index: 0, reason: 'offensive', note: 'rude!' });
  await api.flagItem('rtc_1', { kind: 'correction', index: 0, reason: 'wrong' });
  return api;
}

async function open(api: FakeApi) {
  await renderScreen(<FlagQueueScreen />, { api, signedIn: true });
}

describe('6.14 Reports', () => {
  it('lists the open reports with what was flagged, why and the learner’s note', async () => {
    await open(await reported());

    expect(screen.getByRole('header', { name: 'Reports' })).toBeTruthy();
    expect(await screen.findByText(LENA_LINE)).toBeTruthy();
    expect(
      screen.getByText('Ich habe nach Berlin gefahren → Ich bin nach Berlin gefahren'),
    ).toBeTruthy();
    expect(screen.getByText('Partner’s line')).toBeTruthy();
    expect(screen.getByText('Offensive or unsafe')).toBeTruthy();
    expect(screen.getByText('Their note: rude!')).toBeTruthy();
  });

  it('closes a report as resolved and finds it again under Resolved', async () => {
    const api = await reported();
    await open(api);
    await screen.findByText(LENA_LINE);

    // Newest first: the correction, then the line.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Resolve' })[1]!);

    await waitFor(() => expect(screen.queryByText(LENA_LINE)).toBeNull());
    expect(api.calls).toContainEqual(['resolveFlag', 'flag_1', 'resolved']);
    await fireEvent.press(screen.getByRole('radio', { name: 'Resolved' }));
    expect(await screen.findByText(LENA_LINE)).toBeTruthy();
  });

  it('dismisses a report and opens it again', async () => {
    const api = await reported();
    await open(api);
    await screen.findByText(LENA_LINE);

    await fireEvent.press(screen.getAllByRole('button', { name: 'Dismiss' })[1]!);
    await waitFor(() => expect(screen.queryByText(LENA_LINE)).toBeNull());
    await fireEvent.press(screen.getByRole('radio', { name: 'Dismissed' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Reopen' }));

    expect(await screen.findByText('Nothing dismissed yet.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Open' }));
    expect(await screen.findByText(LENA_LINE)).toBeTruthy();
  });

  it('says so when there is nothing to review', async () => {
    const api = createFakeApi();
    api.enterApp();
    api.beOwner();
    await open(api);

    expect(await screen.findByText('Nothing to review.')).toBeTruthy();
  });

  it('keeps the list and says so when a report cannot be closed', async () => {
    const api = await reported();
    await open(api);
    await screen.findByText(LENA_LINE);
    api.failNext('resolveFlag', 'network');

    await fireEvent.press(screen.getAllByRole('button', { name: 'Resolve' })[0]!);

    expect(await screen.findByText('That didn’t work. Try again.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Resolve' })).toHaveLength(2);
  });

  it('tells an account that is not the owner’s that the page is not for it', async () => {
    const api = createFakeApi();
    api.enterApp();
    await open(api);

    expect(await screen.findByText('This page is for the owner’s account.')).toBeTruthy();
  });

  it('says so when the reports cannot be loaded and tries again', async () => {
    const api = await reported();
    api.failNext('getFlagQueue', 'network');
    await open(api);

    expect(await screen.findByText('The reports couldn’t be loaded.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(LENA_LINE)).toBeTruthy();
  });
});
