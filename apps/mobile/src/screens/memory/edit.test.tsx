import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_MEMORIES, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { MemoryEditScreen } from './edit';

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
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

const [PHOTO, POLITICS, NURSE, INTERVIEW] = FAKE_MEMORIES as [
  (typeof FAKE_MEMORIES)[number],
  (typeof FAKE_MEMORIES)[number],
  (typeof FAKE_MEMORIES)[number],
  (typeof FAKE_MEMORIES)[number],
];

const step = (wheel: string, action: 'increment' | 'decrement') =>
  fireEvent(screen.getByRole('adjustable', { name: wheel }), 'accessibilityAction', {
    nativeEvent: { actionName: action },
  });

describe('6.11 One memory', () => {
  async function open(id: string = INTERVIEW.id) {
    const api: FakeApi = createFakeApi();
    api.enterApp();
    api.remembering();
    jest.mocked(useLocalSearchParams).mockReturnValue({ id });
    await renderScreen(<MemoryEditScreen />, { api, signedIn: true });
    await waitFor(() => expect(screen.queryByText('Loading what your partners know')).toBeNull());
    return api;
  }

  const field = () => screen.getByLabelText('What your partners know');
  const save = () => screen.getByRole('button', { name: 'Save' });
  /** The changes the screen sent for a memory, oldest first. */
  const changes = (api: FakeApi) =>
    api.calls.filter(([method]) => method === 'changeMemory').map(([, id, change]) => [id, change]);
  const removed = (api: FakeApi) =>
    api.calls.filter(([method]) => method === 'removeMemory').map(([, id]) => id);

  it('shows the memory as the partners know it, with its day', async () => {
    await open();

    expect(screen.getByRole('header', { name: 'Change this memory' })).toBeTruthy();
    expect(field()).toHaveProp('value', 'Has a job interview at a logistics company in Zurich.');
    expect(screen.getByText('October 16, 2026')).toBeTruthy();
    // Nothing to save until something is changed.
    expect(save()).toBeDisabled();
  });

  it('saves the learner’s own words and goes back to the list', async () => {
    const api = await open();

    await fireEvent.changeText(field(), 'Interview at Planzer in Zurich.');
    await fireEvent.press(save());

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    // Only what changed is sent: the day stays as it is.
    expect(changes(api)).toEqual([[INTERVIEW.id, { text: 'Interview at Planzer in Zurich.' }]]);
  });

  it('cannot save a memory without words', async () => {
    await open();

    await fireEvent.changeText(field(), '   ');

    expect(save()).toBeDisabled();
  });

  it('moves an event to another day', async () => {
    const api = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Change the day' }));
    // The wheels open on the day it has: 16 October 2026.
    await step('Day', 'increment');
    await step('Month', 'increment');
    await fireEvent.press(screen.getByRole('button', { name: 'Set day' }));
    expect(screen.getByText('November 17, 2026')).toBeTruthy();
    await fireEvent.press(save());

    await waitFor(() => expect(changes(api)).toEqual([[INTERVIEW.id, { day: '2026-11-17' }]]));
  });

  it('takes the day away from something that is not on a day after all', async () => {
    const api = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'No particular day' }));
    expect(screen.queryByText('October 16, 2026')).toBeNull();
    await fireEvent.press(save());

    await waitFor(() => expect(changes(api)).toEqual([[INTERVIEW.id, { day: null }]]));
    // Without a day there is one to set, starting from today (the fake clock's 9 October).
    await fireEvent.press(screen.getByRole('button', { name: 'Set a day' }));
    expect(screen.getByRole('adjustable', { name: 'Day' }).props.accessibilityValue).toEqual({
      text: '9',
    });
  });

  it('offers a day only for something that happens on one', async () => {
    await open(NURSE.id);

    expect(field()).toHaveProp('value', 'Works as a nurse and wants to change jobs.');
    expect(screen.queryByRole('button', { name: 'Change the day' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set a day' })).toBeNull();
  });

  it('says whose it is when it belongs to one partner', async () => {
    await open(PHOTO.id);

    expect(screen.getByText('Only Lena knows this.')).toBeTruthy();
  });

  it('says so when another memory says the same, and stays', async () => {
    const api = await open(NURSE.id);

    await fireEvent.changeText(field(), POLITICS.text);
    await fireEvent.press(save());

    expect(await screen.findByText('Another memory already says this.')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(changes(api)).toHaveLength(1);
  });

  it('says so when it could not be saved', async () => {
    const api = await open();
    api.failNext('changeMemory', 'network');

    await fireEvent.changeText(field(), 'Interview at Planzer.');
    await fireEvent.press(save());

    expect(await screen.findByText(/check your connection/i)).toBeTruthy();
    expect(field()).toHaveProp('value', 'Interview at Planzer.');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('forgets the memory once the learner has confirmed', async () => {
    const api = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Forget this memory' }));
    expect(removed(api)).toEqual([]);
    expect(screen.getByRole('header', { name: 'Forget this?' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Forget it' }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(removed(api)).toEqual([INTERVIEW.id]);
  });

  it('keeps the memory when the learner changes their mind', async () => {
    const api = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Forget this memory' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Keep it' }));

    expect(removed(api)).toEqual([]);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('says so when it could not be forgotten', async () => {
    const api = await open();
    api.failNext('removeMemory', 'network');

    await fireEvent.press(screen.getByRole('button', { name: 'Forget this memory' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Forget it' }));

    expect(await screen.findByText(/check your connection/i)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('says so when the memory is no longer there', async () => {
    await open('eeeeeeee-eeee-4eee-8eee-000000000099');

    expect(screen.getByText('This memory is no longer there.')).toBeTruthy();
    expect(screen.queryByLabelText('What your partners know')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to the list' }));

    expect(router.back).toHaveBeenCalled();
  });
});
