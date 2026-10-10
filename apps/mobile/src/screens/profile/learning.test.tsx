import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { CourseStep } from '@/screens/onboarding/course';
import { LevelStep } from '@/screens/onboarding/level';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { LearningScreen } from './learning';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

function inApp(options?: Parameters<FakeApi['enterApp']>[0]): FakeApi {
  const api = createFakeApi();
  api.enterApp(options);
  return api;
}

async function open(ui: React.ReactElement, api: FakeApi = inApp()) {
  await renderScreen(ui, { api, signedIn: true });
  await waitFor(() => expect(screen.queryByText('Getting things ready')).toBeNull());
  return api;
}

const saved = (api: FakeApi) =>
  api.calls.filter(([method]) => method === 'updateProfile').map(([, changes]) => changes);

describe('6.3 Learning', () => {
  it('reads back what the app knows, with where it came from and when it changed', async () => {
    await open(<LearningScreen />);

    expect(screen.getByRole('header', { name: 'What I know about your learning' })).toBeTruthy();
    expect(screen.getByText('German')).toBeTruthy();
    expect(screen.getByText('English · Only when I’m stuck')).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.getByText('No exam planned')).toBeTruthy();
    expect(screen.getByText('A2 · Elementary')).toBeTruthy();
    expect(screen.getByText('Learning on my own')).toBeTruthy();
    expect(screen.getAllByText('You told me')).toHaveLength(5);
    expect(screen.getAllByText('Changed October 9, 2026')).toHaveLength(5);
  });

  it('shows a level that was measured as measured', async () => {
    await open(<LearningScreen />, inApp({ measured: true }));

    // The learner's own estimate was A2; practice starts at what the test found.
    expect(screen.getByText('B1 · Intermediate')).toBeTruthy();
    expect(screen.getByText('Measured')).toBeTruthy();
    expect(screen.getAllByText('You told me')).toHaveLength(4);
  });

  it.each([
    ['Learning', '/onboarding/language'],
    ['Explanations', '/onboarding/explanations'],
    ['Goals', '/onboarding/goals'],
    ['Level', '/onboarding/level'],
    ['Course or textbook', '/onboarding/course'],
  ])('opens the question behind %s, to come back here afterwards', async (item, pathname) => {
    await open(<LearningScreen />);

    await fireEvent.press(screen.getByRole('button', { name: `Change: ${item}` }));

    expect(router.push).toHaveBeenCalledWith({ pathname, params: { from: 'profile' } });
  });

  it('offers to try again when the answers could not be loaded', async () => {
    const api = inApp();
    api.failNext('getProfile', 'network');
    await renderScreen(<LearningScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('A2 · Elementary')).toBeTruthy();
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<LearningScreen />);

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});

describe('a question opened from the profile', () => {
  beforeEach(() => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ from: 'profile' });
  });

  it('is one question to change, not a step of the setup', async () => {
    await open(<CourseStep />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('saves and returns to the profile', async () => {
    const api = await open(<CourseStep />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Yes, I am' }));
    await fireEvent.changeText(screen.getByLabelText('Course or textbook'), 'Menschen A2');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(saved(api)).toEqual([
      [{ field: 'course', value: { name: 'Menschen A2', chapter: null } }],
    ]);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('has Today read the learner’s day again after a change', async () => {
    const api = await open(<CourseStep />);

    await fireEvent.press(screen.getByRole('radio', { name: 'No, I’m learning on my own' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.calls.some(([method]) => method === 'getHome')).toBe(true));
  });

  it('starts the level question at the level practice runs at', async () => {
    await open(<LevelStep />, inApp({ measured: true }));

    expect(screen.getByRole('radio', { name: /B1 · Intermediate/ })).toBeChecked();
  });

  it('changes the level practice runs at, not only the learner’s estimate', async () => {
    const api = await open(<LevelStep />, inApp({ measured: true }));

    await fireEvent.press(screen.getByRole('radio', { name: /B2 · Upper intermediate/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(saved(api)).toEqual([
      [
        { field: 'self_assessed_level', value: 'B2' },
        { field: 'starting_level', value: 'B2' },
      ],
    ]);
    expect((await api.getHome()).level).toMatchObject({ level: 'B2', source: 'asked' });
  });
});
