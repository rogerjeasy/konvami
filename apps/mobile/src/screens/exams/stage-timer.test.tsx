import { act, render, screen } from '@testing-library/react-native';
import { SpeakingWindow, StageTimer } from './stage-timer';

it('allows the full speaking window and ends it once', async () => {
  jest.useFakeTimers();
  let ended = 0;
  await render(
    <StageTimer
      seconds={30}
      label="Speaking time"
      onEnd={() => {
        ended += 1;
      }}
    />,
  );
  expect(screen.getByText('Speaking time · 0:30')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(29_000);
  });
  expect(ended).toBe(0);
  await act(async () => {
    jest.advanceTimersByTime(1_000);
  });
  expect(ended).toBe(1);
  await act(async () => {
    jest.advanceTimersByTime(10_000);
  });
  expect(ended).toBe(1);
  jest.useRealTimers();
});

it('waits for the examiner and keeps counting when the learner starts speaking', async () => {
  jest.useFakeTimers();
  let ended = 0;
  const onEnd = () => {
    ended += 1;
  };
  const view = await render(
    <SpeakingWindow ready={false} seconds={30} label="Time" onEnd={onEnd} />,
  );
  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });
  expect(ended).toBe(0);
  await view.rerender(<SpeakingWindow ready seconds={30} label="Time" onEnd={onEnd} />);
  await act(async () => {
    jest.advanceTimersByTime(15_000);
  });
  await view.rerender(<SpeakingWindow ready={false} seconds={30} label="Time" onEnd={onEnd} />);
  await act(async () => {
    jest.advanceTimersByTime(15_000);
  });
  expect(ended).toBe(1);
  jest.useRealTimers();
});
