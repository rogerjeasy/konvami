import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '@konvami/api-client';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import * as support from '@/lib/support';
import { renderScreen } from '@/test/render';
import { HelpScreen } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

// The support address is a build setting; a test sets it before it renders the screen.
jest.mock('@/lib/support', () => {
  let email: string | null = null;
  const actual = jest.requireActual('@/lib/support');
  return Object.defineProperties(
    { ...actual, setSupportEmail: (next: string | null) => (email = next) },
    { SUPPORT_EMAIL: { get: () => email, enumerable: true } },
  );
});

const mockOpenSupport = jest.fn();
jest.mock('@/lib/external', () => ({
  openSupportEmail: (...args: unknown[]) => mockOpenSupport(...args),
}));

const setSupportEmail = (email: string | null) =>
  (support as unknown as { setSupportEmail: (email: string | null) => void }).setSupportEmail(
    email,
  );

beforeEach(() => {
  jest.clearAllMocks();
  setSupportEmail(null);
});

async function open(api: FakeApi = createFakeApi()) {
  api.enterApp();
  await renderScreen(<HelpScreen />, { api, signedIn: true });
  await screen.findByRole('header', { name: 'Help and feedback' });
  return api;
}

describe('6.20 Help and feedback', () => {
  it('answers a question when it is opened', async () => {
    await open();
    expect(screen.queryByText(/lasts up to 10 minutes/)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'How do I start a conversation?' }));

    expect(screen.getByText(/lasts up to 10 minutes/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'How do I start a conversation?' }).props
        .accessibilityState,
    ).toMatchObject({ expanded: true });
  });

  it('has no email row without a support address', async () => {
    await open();

    expect(screen.queryByRole('button', { name: 'Email support' })).toBeNull();
  });

  it('opens a message to the support address when the build has one', async () => {
    setSupportEmail('help@konvami.example');
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Email support' }));

    expect(mockOpenSupport).toHaveBeenCalledWith('help@konvami.example', 'Help and feedback');
  });

  it('sends nothing until there is a message', async () => {
    await open();

    expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('sends the category and the message, and no device unless it is ticked', async () => {
    const api = await open();

    await fireEvent.press(screen.getByRole('radio', { name: 'An idea' }));
    await fireEvent.changeText(screen.getByLabelText('Your message'), '  A dark mode switch  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Thank you')).toBeTruthy();
    expect(api.calls).toContainEqual([
      'sendFeedback',
      { category: 'idea', message: 'A dark mode switch', device: null },
    ]);
  });

  it('sends the app and system version when the learner ticks the box', async () => {
    const api = await open();

    await fireEvent.changeText(screen.getByLabelText('Your message'), 'The call drops');
    await fireEvent.press(screen.getByRole('switch', { name: 'Include device and app version' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    await screen.findByText('Thank you');
    const [, sent] = api.calls.find(([name]) => name === 'sendFeedback')!;
    expect(sent).toMatchObject({
      category: 'bug',
      message: 'The call drops',
      device: { platform: 'ios' },
    });
  });

  it('offers another message after one is sent', async () => {
    await open();
    await fireEvent.changeText(screen.getByLabelText('Your message'), 'Hello');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Thank you');

    await fireEvent.press(screen.getByRole('button', { name: 'Send another' }));

    expect(screen.getByLabelText('Your message').props.value).toBe('');
  });

  it('says so when the day’s limit is reached, and keeps the message', async () => {
    const api = createFakeApi();
    api.sendFeedback = jest.fn().mockRejectedValue(new ApiError('feedback_limit', 429));
    await open(api);

    await fireEvent.changeText(screen.getByLabelText('Your message'), 'Hello');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.getByText(/You have sent a lot of messages today/)).toBeTruthy(),
    );
    expect(screen.getByLabelText('Your message').props.value).toBe('Hello');
  });
});
