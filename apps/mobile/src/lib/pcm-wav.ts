// Azure short-audio assessment accepts mono PCM16 at 16 kHz, at most thirty seconds.
export const ASSESSMENT_SAMPLE_RATE = 16_000;
const MAX_SECONDS = 30;
const HEADER_BYTES = 44;
const SAMPLE_BYTES = 2;
const PCM_MIN = -32768;
const PCM_MAX = 32767;

/** Encodes already resampled audio. Decoders perform anti-aliased resampling before this step. */
export function encodeAssessmentWav(
  channels: readonly Float32Array[],
  sampleRate: number,
): Uint8Array<ArrayBuffer> {
  const frames = channels[0]?.length ?? 0;
  if (
    sampleRate !== ASSESSMENT_SAMPLE_RATE ||
    !frames ||
    frames > MAX_SECONDS * sampleRate ||
    channels.some((channel) => channel.length !== frames)
  ) {
    throw new Error('unsupported_audio');
  }
  const bytes = new Uint8Array(HEADER_BYTES + frames * SAMPLE_BYTES);
  const data = new DataView(bytes.buffer);
  const label = (offset: number, text: string) =>
    [...text].forEach((letter, index) => data.setUint8(offset + index, letter.charCodeAt(0)));
  label(0, 'RIFF');
  data.setUint32(4, bytes.length - 8, true);
  label(8, 'WAVE');
  label(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, sampleRate, true);
  data.setUint32(28, sampleRate * SAMPLE_BYTES, true);
  data.setUint16(32, SAMPLE_BYTES, true);
  data.setUint16(34, 16, true);
  label(36, 'data');
  data.setUint32(40, frames * SAMPLE_BYTES, true);
  for (let frame = 0; frame < frames; frame++) {
    const value =
      channels.reduce((sum, channel) => sum + (channel[frame] ?? 0), 0) / channels.length;
    if (!Number.isFinite(value)) throw new Error('unsupported_audio');
    const sample = Math.max(-1, Math.min(1, value));
    data.setInt16(
      HEADER_BYTES + frame * SAMPLE_BYTES,
      Math.round(sample * (sample < 0 ? -PCM_MIN : PCM_MAX)),
      true,
    );
  }
  return bytes;
}

export function wavBase64(bytes: Uint8Array): string {
  // Avoid spreading a whole recording into function arguments (mobile stack limits are small).
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
