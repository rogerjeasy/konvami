import { encodeAssessmentWav, ASSESSMENT_SAMPLE_RATE } from './pcm-wav';

it('encodes mono PCM16 with an accurate WAV header and clips amplitudes', () => {
  const bytes = encodeAssessmentWav([new Float32Array([-2, 0, 2])], ASSESSMENT_SAMPLE_RATE);
  const data = new DataView(bytes.buffer);
  expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
  expect(data.getUint32(24, true)).toBe(16000);
  expect(data.getUint16(22, true)).toBe(1);
  expect(data.getUint32(40, true)).toBe(6);
  expect([44, 46, 48].map((offset) => data.getInt16(offset, true))).toEqual([-32768, 0, 32767]);
});
it('averages channels rather than silently discarding one', () => {
  const data = new DataView(
    encodeAssessmentWav([new Float32Array([1]), new Float32Array([-1])], 16000).buffer,
  );
  expect(data.getInt16(44, true)).toBe(0);
});
it('rejects empty, long, inconsistent or non-resampled audio', () => {
  for (const channels of [
    [],
    [new Float32Array()],
    [new Float32Array(16000 * 31)],
    [new Float32Array(1), new Float32Array(2)],
  ]) {
    expect(() => encodeAssessmentWav(channels, 16000)).toThrow();
  }
  expect(() => encodeAssessmentWav([new Float32Array(1)], 44100)).toThrow();
});
