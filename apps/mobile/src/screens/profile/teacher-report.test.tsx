import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import type { LibraryTools } from '@/offline/library';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { TeacherReportScreen } from './teacher-report';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useFocusEffect: jest.fn(),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
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

function tools(shared: { html: string; name: string }[]): LibraryTools {
  return {
    sharePdf: async (html: string, name: string) => {
      shared.push({ html, name });
    },
  } as unknown as LibraryTools;
}

describe('6.23 Report for my teacher', () => {
  it('summarises the period and shares a PDF with the transcripts the learner ticks', async () => {
    const api = inApp();
    const shared: { html: string; name: string }[] = [];
    await renderScreen(<TeacherReportScreen />, {
      api,
      signedIn: true,
      libraryTools: tools(shared),
    });

    expect(await screen.findByText('1 conversation · 30 min spoken')).toBeTruthy();
    expect(api.calls).toContainEqual(['getTeacherReport', 30]);

    await fireEvent.press(screen.getByRole('radio', { name: 'Last 7 days' }));
    await waitFor(() => expect(api.calls).toContainEqual(['getTeacherReport', 7]));

    await fireEvent.press(await screen.findByRole('button', { name: 'Make the PDF' }));

    await waitFor(() => expect(shared).toHaveLength(1));
    expect(shared[0]!.name).toBe('konvami-report-7');
    expect(shared[0]!.html).toContain('Language practice report');
    expect(shared[0]!.html).toContain('mit dem Mann');
    expect(shared[0]!.html).not.toContain('Transcripts');
  });

  it('says so when the report cannot be read, and reads it again', async () => {
    const api = inApp();
    api.failNext('getTeacherReport', 'network');
    await renderScreen(<TeacherReportScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('1 conversation · 30 min spoken')).toBeTruthy();
  });
});
