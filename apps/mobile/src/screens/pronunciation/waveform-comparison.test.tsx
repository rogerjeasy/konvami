import { useState } from 'react';
import { Button } from '@/components/button';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '@/test/render';
import { createFakeApi } from '@/test/fake-api';
import { decodeAudio } from '@/voice/decoded-audio';
import { WaveformComparison } from './waveform-comparison';

jest.mock('@/voice/decoded-audio', () => ({ canDecodeAudio: () => true, decodeAudio: jest.fn() }));
const recording = {
  base64: 'AAEC',
  format: 'm4a' as const,
  durationMs: 2400,
  uri: 'file:///voice.m4a',
};
beforeEach(() => jest.clearAllMocks());

it('compares actual decoded recordings and explains the limits of the shapes', async () => {
  jest.mocked(decodeAudio).mockResolvedValueOnce({
    channels: [new Float32Array([0, 1, 0])],
    sampleRate: 16000,
    durationMs: 2400,
  });
  jest.mocked(decodeAudio).mockResolvedValueOnce({
    channels: [new Float32Array([0, 0.5, 0])],
    sampleRate: 16000,
    durationMs: 1800,
  });
  const api = createFakeApi();
  api.enterApp();
  await renderScreen(<WaveformComparison recording={recording} reference="für" />, {
    api,
    signedIn: true,
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Compare waveforms' }));
  expect(await screen.findByText('Your recording')).toBeTruthy();
  expect(screen.getByText('Reference recording')).toBeTruthy();
  expect(screen.getByText('2.4 seconds')).toBeTruthy();
  expect(screen.getByText('1.8 seconds')).toBeTruthy();
  expect(screen.getByText(/It does not measure pronunciation accuracy/)).toBeTruthy();
  expect(decodeAudio).toHaveBeenCalledWith(recording);
});

it('keeps a retry action when decoding fails without inventing a waveform', async () => {
  jest.mocked(decodeAudio).mockRejectedValue(new Error('unavailable'));
  const api = createFakeApi();
  api.enterApp();
  await renderScreen(<WaveformComparison recording={recording} reference="für" />, {
    api,
    signedIn: true,
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Compare waveforms' }));
  expect(await screen.findByText('The recordings could not be compared. Try again.')).toBeTruthy();
  expect(screen.queryByText('Your recording')).toBeNull();
  expect(screen.getByRole('button', { name: 'Compare waveforms' })).toBeEnabled();
});

it('resets for a new recording and discards an older pending decode', async () => {
  let finish: (audio: Awaited<ReturnType<typeof decodeAudio>>) => void = () => {};
  jest.mocked(decodeAudio).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  jest
    .mocked(decodeAudio)
    .mockResolvedValueOnce({
      channels: [new Float32Array([1])],
      sampleRate: 16000,
      durationMs: 1000,
    });
  function ChangingRecording() {
    const [value, setValue] = useState(recording);
    return (
      <>
        <Button
          label="Use next recording"
          onPress={() => setValue({ ...recording, base64: 'different' })}
        />
        <WaveformComparison recording={value} reference="für" />
      </>
    );
  }
  const api = createFakeApi();
  api.enterApp();
  await renderScreen(<ChangingRecording />, { api, signedIn: true });
  await fireEvent.press(screen.getByRole('button', { name: 'Compare waveforms' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Use next recording' }));
  expect(screen.getByRole('button', { name: 'Compare waveforms' })).toBeEnabled();
  await act(async () => {
    finish({ channels: [new Float32Array([1])], sampleRate: 16000, durationMs: 2400 });
  });
  expect(screen.queryByText('Your recording')).toBeNull();
  expect(screen.getByRole('button', { name: 'Compare waveforms' })).toBeEnabled();
});
