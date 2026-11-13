import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import '@/i18n';
import { useWalkingCall } from './use-walking-call';
import { createWalkingSession } from './walking-session';
import type { VoiceCall } from './use-voice-call';

jest.mock('./walking-session', () => ({ createWalkingSession: jest.fn() }));
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
});
afterEach(() => jest.restoreAllMocks());

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

it('cancels a pending permission request when push-to-talk disables walking', async () => {
  let release!: () => void;
  let controls!: { mute(value: boolean): void; stop(): void };
  const session = {
    start: jest.fn((_labels, next) => {
      controls = next;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    }),
    stop: jest.fn(),
  };
  jest.mocked(createWalkingSession).mockReturnValue(session);
  const call = {
    status: 'live',
    muted: true,
    setPushToTalk: jest.fn(),
    toggleMute: jest.fn(),
  } as unknown as VoiceCall;
  const hook = await renderHook(() => useWalkingCall(call, jest.fn()));
  let starting!: Promise<void>;
  await act(() => {
    starting = hook.result.current.set(true);
  });
  expect(hook.result.current.busy).toBe(true);
  await act(async () => hook.result.current.set(false));
  expect(session.stop).toHaveBeenCalled();
  await act(async () => {
    release();
    await starting;
  });
  expect(hook.result.current.enabled).toBe(false);
  expect(hook.result.current.busy).toBe(false);
  controls.mute(false);
  expect(call.toggleMute).not.toHaveBeenCalled();
  await hook.unmount();
});

it('ignores a permission response after the call fails', async () => {
  let controls!: { mute(value: boolean): void; stop(): void };
  let release!: () => void;
  const session = {
    start: jest.fn((_labels, next) => {
      controls = next;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    }),
    stop: jest.fn(),
  };
  jest.mocked(createWalkingSession).mockReturnValue(session);
  const live = {
    status: 'live',
    muted: false,
    setPushToTalk: jest.fn(),
    toggleMute: jest.fn(),
  } as unknown as VoiceCall;
  const hook = await renderHook(({ call }: { call: VoiceCall }) => useWalkingCall(call, jest.fn()), {
    initialProps: { call: live },
  });
  let starting!: Promise<void>;
  await act(() => {
    starting = hook.result.current.set(true);
  });
  await hook.rerender({ call: { ...live, status: 'failed' } });
  await act(async () => {
    release();
    await starting;
  });
  expect(hook.result.current.enabled).toBe(false);
  expect(session.stop).toHaveBeenCalled();
  controls.mute(true);
  expect(live.toggleMute).not.toHaveBeenCalled();
  await hook.unmount();
});
