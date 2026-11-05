import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { installId, INSTALL_ID_KEY } from '@/analytics/install-id';
import { readItem } from '@/lib/storage';
import { getPreferences, setAnalytics } from '@/preferences';
import { createFakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { PrivacyScreen } from './privacy';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

// This build has analytics (a key is set); the real sender and its network are not needed.
jest.mock('@/analytics', () => ({
  analyticsAvailable: true,
  track: jest.fn(),
}));

beforeEach(() => setAnalytics(false));

async function open() {
  const api = createFakeApi();
  api.enterApp();
  await renderScreen(<PrivacyScreen />, { api, signedIn: true });
  return screen.findByRole('switch', { name: 'Share anonymous usage data' });
}

describe('6.7 Privacy and AI: anonymous usage data', () => {
  it('is off until the learner turns it on', async () => {
    const usage = await open();

    expect(usage).not.toBeChecked();
    expect(screen.getByText(/Nothing is counted/)).toBeTruthy();
  });

  it('turns on, and off again, and off forgets the id the events carried', async () => {
    const usage = await open();

    await fireEvent.press(usage);
    await waitFor(() => expect(getPreferences().analytics).toBe(true));
    const id = await installId();
    expect(await readItem(INSTALL_ID_KEY)).toBe(id);

    await fireEvent.press(screen.getByRole('switch', { name: 'Share anonymous usage data' }));

    await waitFor(() => expect(getPreferences().analytics).toBe(false));
    await waitFor(async () => expect(await readItem(INSTALL_ID_KEY)).toBeNull());
  });
});
