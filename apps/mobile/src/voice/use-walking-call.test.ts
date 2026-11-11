import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import '@/i18n';
import { useWalkingCall } from './use-walking-call';
import { createWalkingSession } from './walking-session';
import type { VoiceCall } from './use-voice-call';

jest.mock('./walking-session', () => ({ createWalkingSession: jest.fn() }));

it('keeps an opted-in call alive in the background and stops its service on unmount', async () => {
  let changed: (state: AppStateStatus) => void = () => {};
  const subscription = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_, listener) => {
      changed = listener;
      return { remove: jest.fn() };
    });
  const session = { start: jest.fn(async () => {}), stop: jest.fn() };
  jest.mocked(createWalkingSession).mockReturnValue(session);
  const call = {
    status: 'live',
    muted: false,
    setPushToTalk: jest.fn(),
    toggleMute: jest.fn(),
  } as unknown as VoiceCall;
  const leave = jest.fn();
  const hook = await renderHook(() => useWalkingCall(call, leave));
  await act(async () => hook.result.current.set(true));
  expect(hook.result.current.enabled).toBe(true);
  await act(() => changed('background'));
  expect(leave).not.toHaveBeenCalled();
  await act(async () => hook.result.current.set(false));
  await act(() => changed('background'));
  expect(leave).toHaveBeenCalledTimes(1);
  await hook.unmount();
  expect(session.stop).toHaveBeenCalled();
  subscription.mockRestore();
});
