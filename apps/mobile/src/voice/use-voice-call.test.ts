import { act, renderHook } from '@testing-library/react-native';
import { createFakeVoiceEngine } from '@/test/fake-voice-engine';
import { useVoiceEngineFactory } from './services';
import { useVoiceCall } from './use-voice-call';
import type { AudioLevels } from './engine';

jest.mock('./services', () => ({ useVoiceEngineFactory: jest.fn() }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('react-native-reanimated', () => ({
  useSharedValue(value: number) {
    return jest.requireActual('react').useRef({
      value,
      set(next: number) {
        this.value = next;
      },
    }).current;
  },
  withTiming: (value: number) => value,
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup() {
  const engine = createFakeVoiceEngine();
  jest.mocked(useVoiceEngineFactory).mockReturnValue(() => engine);
  const hook = await renderHook(() => useVoiceCall('practice'));
  return { engine, hook };
}

it('ignores audio levels returned after the hook is unmounted', async () => {
  const { engine, hook } = await setup();
  let release!: (value: AudioLevels) => void;
  engine.levels = jest.fn(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await act(() => engine.emit({ type: 'output_audio_buffer.started' }));
  const mouth = hook.result.current.mouth;
  await act(async () => jest.advanceTimersByTimeAsync(100));
  await hook.unmount();
  await act(async () => {
    release({ persona: 0.9, learner: 0.9 });
  });
  expect(mouth.value).toBe(0);
});

it('handles a closed-peer level request and waits for reconnection before polling again', async () => {
  const { engine, hook } = await setup();
  engine.levels = jest.fn().mockRejectedValue(new Error('peer closed'));
  await act(async () => jest.advanceTimersByTimeAsync(100));
  await act(() => engine.emit({ type: 'connection.reconnecting', muted: true }));
  const count = jest.mocked(engine.levels).mock.calls.length;
  await act(async () => jest.advanceTimersByTimeAsync(500));
  expect(engine.levels).toHaveBeenCalledTimes(count);
  await hook.unmount();
});

it('does not show an open microphone when a push-to-talk press cannot be sent', async () => {
  const { engine, hook } = await setup();
  engine.beginTurn = jest.fn(() => false);
  await act(() => hook.result.current.setPushToTalk(true));
  await act(() => hook.result.current.beginTurn());
  expect(hook.result.current.muted).toBe(true);
  await act(() => hook.result.current.toggleMute());
  expect(hook.result.current.muted).toBe(true);
  await hook.unmount();
});
