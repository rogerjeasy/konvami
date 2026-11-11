import { TurboModuleRegistry } from 'react-native';
import { ASSESSMENT_SAMPLE_RATE, encodeAssessmentWav, wavBase64 } from '@/lib/pcm-wav';
import type { SentenceRecording } from './sentence-recorder';

// Check before loading the JSI library so Expo Go can still open the pronunciation lab.
export const canAssessAudio = () => TurboModuleRegistry.get('AudioAPIModule') !== null;

/** Decode locally; the original M4A is never mislabeled as PCM or sent to another service. */
export async function assessmentAudio(recording: SentenceRecording): Promise<SentenceRecording> {
  if (!canAssessAudio()) throw new Error('unavailable');
  const { AudioContext } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-audio-api') as typeof import('react-native-audio-api');
  const context = new AudioContext({ sampleRate: ASSESSMENT_SAMPLE_RATE });
  try {
    const decoded = await context.decodeAudioData(recording.uri);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
      decoded.getChannelData(index),
    );
    return {
      ...recording,
      base64: wavBase64(encodeAssessmentWav(channels, decoded.sampleRate)),
      format: 'wav',
      durationMs: Math.round(decoded.duration * 1000),
    };
  } finally {
    await context.close();
  }
}
