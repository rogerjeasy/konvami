import { TurboModuleRegistry } from 'react-native';
import { ASSESSMENT_SAMPLE_RATE } from '@/lib/pcm-wav';
import type { SentenceRecording } from './sentence-recorder';

export interface DecodedAudio {
  channels: Float32Array[];
  sampleRate: number;
  durationMs: number;
}

// Avoid loading the JSI module in Expo Go, which would fail before it can be caught.
export const canDecodeAudio = () => TurboModuleRegistry.get('AudioAPIModule') !== null;

/** Decode both saved reference audio and learner recordings locally, at a shared sample rate. */
export async function decodeAudio(source: string | SentenceRecording): Promise<DecodedAudio> {
  if (!canDecodeAudio()) throw new Error('unavailable');
  const { AudioContext } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-audio-api') as typeof import('react-native-audio-api');
  const context = new AudioContext({ sampleRate: ASSESSMENT_SAMPLE_RATE });
  try {
    const decoded = await context.decodeAudioData(typeof source === 'string' ? source : source.uri);
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
