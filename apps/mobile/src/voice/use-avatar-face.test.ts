import { act, renderHook } from '@testing-library/react-native';
import { INITIAL_CONVERSATION, type ConversationState } from './conversation';
import { EXPRESSION_HOLD_MS, HMM_HOLD_MS, useAvatarFace } from './use-avatar-face';

const asking = (expression: ConversationState['expression']): ConversationState => ({
  ...INITIAL_CONVERSATION,
  expression,
});
const HAPPY = { expression: 'happy', gesture: 'none', seq: 1, callId: 'c1' } as const;
const CORRECTION = { turn: 't', said: 'a', better: 'b', why: 'w', topic: 'x', focus: false };

describe('useAvatarFace', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rests until the partner asks for a face', async () => {
    const { result } = await renderHook(() => useAvatarFace(INITIAL_CONVERSATION));

    expect(result.current).toEqual({ expression: 'neutral', gesture: 'none' });
  });

  it('shows the face the partner asked for, then goes back to rest', async () => {
    const { result } = await renderHook(() => useAvatarFace(asking(HAPPY)));

    expect(result.current.expression).toBe('happy');
    await act(async () => {
      jest.advanceTimersByTime(EXPRESSION_HOLD_MS + 1);
    });
    expect(result.current).toEqual({ expression: 'neutral', gesture: 'none' });
  });

  it('shows a thumbs-up the partner asked for', async () => {
    const { result } = await renderHook(() =>
      useAvatarFace(asking({ ...HAPPY, expression: 'encouraging', gesture: 'thumbsUp' })),
    );

    expect(result.current).toEqual({ expression: 'encouraging', gesture: 'thumbsUp' });
  });

  it('makes a thoughtful face for a moment when a correction comes in', async () => {
    const { result, rerender } = await renderHook(
      ({ state }: { state: ConversationState }) => useAvatarFace(state),
      { initialProps: { state: INITIAL_CONVERSATION } },
    );

    await rerender({ state: { ...INITIAL_CONVERSATION, corrections: [CORRECTION] } });
    expect(result.current.gesture).toBe('hmm');

    await act(async () => {
      jest.advanceTimersByTime(HMM_HOLD_MS + 1);
    });
    expect(result.current.gesture).toBe('none');
  });

  it('keeps the face the partner asked for when a correction comes in', async () => {
    const { result, rerender } = await renderHook(
      ({ state }: { state: ConversationState }) => useAvatarFace(state),
      { initialProps: { state: asking(HAPPY) } },
    );

    await rerender({ state: { ...asking(HAPPY), corrections: [CORRECTION] } });

    expect(result.current).toEqual({ expression: 'happy', gesture: 'none' });
  });
});
