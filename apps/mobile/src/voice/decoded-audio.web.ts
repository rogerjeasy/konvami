import { ASSESSMENT_SAMPLE_RATE } from '@/lib/pcm-wav';
import type { SentenceRecording } from './sentence-recorder';

export interface DecodedAudio {
  channels: Float32Array[];
  sampleRate: number;
  durationMs: number;
}
export const canDecodeAudio = () => typeof AudioContext !== 'undefined';

export async function decodeAudio(source: string | SentenceRecording): Promise<DecodedAudio> {
  const context = new AudioContext({ sampleRate: ASSESSMENT_SAMPLE_RATE });
  try {
    let bytes: ArrayBuffer;
    if (typeof source === 'string') {
      const response = await fetch(source);
      if (!response.ok) throw new Error('unavailable');
      bytes = await response.arrayBuffer();
    } else {
      bytes = Uint8Array.from(atob(source.base64), (letter) => letter.charCodeAt(0)).buffer;
    }
    const decoded = await context.decodeAudioData(bytes);
    return {
      channels: Array.from({ length: decoded.numberOfChannels }, (_, index) =>
        decoded.getChannelData(index).slice(),
      ),
      sampleRate: decoded.sampleRate,
      durationMs: Math.round(decoded.duration * 1000),
    };
  } finally {
    await context.close();
  }
}
