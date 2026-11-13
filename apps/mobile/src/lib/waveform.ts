// A bounded number of bars makes the timing shape readable on compact screens.
export const WAVEFORM_BINS = 48;

/** Per-bin RMS across channels, normalized to each recording's own peak (not a score). */
export function waveformEnvelope(
  channels: readonly Float32Array[],
  bins = WAVEFORM_BINS,
): number[] {
  const length = channels[0]?.length ?? 0;
  if (!length) return [];
  if (
    !Number.isInteger(bins) ||
    bins < 1 ||
    channels.some((channel) => channel.length !== length)
  ) {
    throw new Error('invalid_audio');
  }
  const count = Math.min(bins, length);
  const values = Array.from({ length: count }, (_, bin) => {
    const start = Math.floor((bin * length) / count);
    const end = Math.floor(((bin + 1) * length) / count);
    let energy = 0;
    for (const channel of channels) {
      for (let frame = start; frame < end; frame++) {
        const sample = channel[frame] ?? 0;
        if (!Number.isFinite(sample)) throw new Error('invalid_audio');
        energy += sample * sample;
      }
    }
    return Math.sqrt(energy / ((end - start) * channels.length));
  });
  const peak = Math.max(...values);
  return peak ? values.map((value) => value / peak) : values;
}
