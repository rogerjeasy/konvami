import { fireEvent, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, ESSENTIAL_ANSWERS } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { HomeScreen } from '.';

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

function apiWith(answers: number) {
  const api = createFakeApi();
  api.answer(ESSENTIAL_ANSWERS.slice(0, answers));
  return api;
}

describe('Home: continues onboarding where the learner left off, then enters the app', () => {
  it('starts someone who has answered nothing on All set', async () => {
    await renderScreen(<HomeScreen />, { api: apiWith(0), signedIn: true });

    expect(await screen.findByText('redirect:/all-set')).toBeTruthy();
  });

  it('resumes a half-finished form at the first open question', async () => {
    await renderScreen(<HomeScreen />, { api: apiWith(5), signedIn: true });

    expect(await screen.findByText('redirect:/onboarding/level')).toBeTruthy();
  });

  it('shows the review when every question is answered', async () => {
    await renderScreen(<HomeScreen />, { api: apiWith(7), signedIn: true });

    expect(await screen.findByText('redirect:/onboarding/review')).toBeTruthy();
  });

  it.each([
    ['placement', '/onboarding/placement'],
    ['partners', '/onboarding/partners'],
    ['ready', '/onboarding/ready'],
  ] as const)('continues a learner who has reached the %s stage there', async (stage, route) => {
    const api = createFakeApi();
    api.advanceTo(stage);
    await renderScreen(<HomeScreen />, { api, signedIn: true });

    expect(await screen.findByText(`redirect:${route}`)).toBeTruthy();
  });

  it('follows up a placement test that was taken on its result screen', async () => {
    const api = createFakeApi();
    api.advanceTo('placement');
    api.assess('measured');
    await renderScreen(<HomeScreen />, { api, signedIn: true });

    expect(await screen.findByText('redirect:/onboarding/placement/result')).toBeTruthy();
  });

  it('enters the app once onboarding is done', async () => {
    const api = createFakeApi();
    api.advanceTo('ready');
    await api.completeOnboarding();
    await renderScreen(<HomeScreen />, { api, signedIn: true });

    expect(await screen.findByText('redirect:/today')).toBeTruthy();
  });

  it('offers to try again when the stage cannot be loaded', async () => {
    const api = apiWith(7);
    api.failNext('getOnboarding', 'unknown');
    await renderScreen(<HomeScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('redirect:/onboarding/review')).toBeTruthy();
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<HomeScreen />, { api: apiWith(0) });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
