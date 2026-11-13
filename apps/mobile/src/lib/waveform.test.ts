import { waveformEnvelope } from './waveform';

it('retains the temporal shape with a fixed bounded number of bins', () => {
  const envelope = waveformEnvelope([new Float32Array([0, 0, 1, 1, 0, 0, 0.5, 0.5])], 4);
  expect(envelope).toEqual([0, 1, 0, 0.5]);
});
it('averages channel energy and handles silent or empty recordings', () => {
  expect(waveformEnvelope([new Float32Array(4)], 2)).toEqual([0, 0]);
  expect(waveformEnvelope([], 2)).toEqual([]);
  expect(waveformEnvelope([new Float32Array([1, 0]), new Float32Array([-1, 0])], 2)).toEqual([
    1, 0,
  ]);
});
it('rejects malformed samples rather than drawing NaN coordinates', () => {
  expect(() => waveformEnvelope([new Float32Array([NaN])], 1)).toThrow();
  expect(() => waveformEnvelope([new Float32Array(1), new Float32Array(2)], 1)).toThrow();
});
