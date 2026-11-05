import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { FeedbackInboxScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

/** An owner, and two messages learners sent: one with the device, one without. */
async function received(): Promise<FakeApi> {
  const api = createFakeApi();
  api.enterApp();
  api.beOwner();
  await api.sendFeedback({
    category: 'bug',
    message: 'The call drops',
    device: { appVersion: '0.1.0', platform: 'ios', osVersion: '19.1' },
  });
  await api.sendFeedback({ category: 'idea', message: 'A dark mode switch' });
  return api;
}

async function open(api: FakeApi) {
  await renderScreen(<FeedbackInboxScreen />, { api, signedIn: true });
}

describe('6.21 Feedback', () => {
  it('lists the open messages with their category and, when sent, the device', async () => {
    await open(await received());

    expect(screen.getByRole('header', { name: 'Feedback' })).toBeTruthy();
    expect(await screen.findByText('The call drops')).toBeTruthy();
    expect(screen.getByText('A dark mode switch')).toBeTruthy();
    expect(screen.getByText('A problem')).toBeTruthy();
    expect(screen.getByText('An idea')).toBeTruthy();
    expect(screen.getByText('iOS · app 0.1.0 · system 19.1')).toBeTruthy();
  });

  it('marks a message done, finds it under Done and opens it again', async () => {
    const api = await received();
    await open(api);
    await screen.findByText('The call drops');

    // Newest first: the idea, then the problem.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Mark done' })[1]!);

    await waitFor(() => expect(screen.queryByText('The call drops')).toBeNull());
    expect(api.calls).toContainEqual(['resolveFeedback', 'feedback_1', 'done']);
    await fireEvent.press(screen.getByRole('radio', { name: 'Done' }));
    expect(await screen.findByText('The call drops')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Reopen' }));

    await waitFor(() => expect(screen.queryByText('The call drops')).toBeNull());
    expect(api.calls).toContainEqual(['resolveFeedback', 'feedback_1', 'open']);
  });

  it('says so when nothing has been sent', async () => {
    const api = createFakeApi();
    api.enterApp();
    api.beOwner();
    await open(api);

    expect(await screen.findByText('Nothing to read.')).toBeTruthy();
  });

  it('refuses anyone but the owner', async () => {
    const api = createFakeApi();
    api.enterApp();
    await open(api);

    expect(await screen.findByText('This page is for the owner’s account.')).toBeTruthy();
  });
});
