import { Linking } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { ExportScreen } from './export';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

async function open(): Promise<FakeApi> {
  const api = createFakeApi();
  api.enterApp();
  await renderScreen(<ExportScreen />, { api, signedIn: true });
  return api;
}

describe('6.19 Export my data', () => {
  it('says what the copy holds and offers to prepare it', async () => {
    await open();

    expect(screen.getByRole('header', { name: 'Export my data' })).toBeTruthy();
    expect(screen.getByText(/Your password is not\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Prepare my data' })).toBeTruthy();
  });

  it('prepares the copy, says how long its link works and opens the file', async () => {
    const open$ = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const api = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Prepare my data' }));

    expect(await screen.findByText('Your data is ready')).toBeTruthy();
    expect(screen.getByText(/The link works for 60 minutes/)).toBeTruthy();
    expect(api.calls).toContainEqual(['exportData']);
    await fireEvent.press(screen.getByRole('button', { name: 'Open the file' }));
    expect(open$).toHaveBeenCalledWith('https://files.test/exports/copy.json');
  });

  it('says when the day’s copies are used up', async () => {
    const api = await open();
    api.failNext('exportData', 'export_limit');

    await fireEvent.press(screen.getByRole('button', { name: 'Prepare my data' }));

    expect(await screen.findByText(/three times today/)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Prepare my data' })).toBeTruthy(),
    );
  });

  it('says so when the network fails, and lets the learner try again', async () => {
    const api = await open();
    api.failNext('exportData', 'network');

    await fireEvent.press(screen.getByRole('button', { name: 'Prepare my data' }));

    expect(await screen.findByText(/connection/i)).toBeTruthy();
    expect(screen.queryByText('Your data is ready')).toBeNull();
  });
});
