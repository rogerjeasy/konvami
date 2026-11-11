import { ASSESSMENT_SAMPLE_RATE, encodeAssessmentWav, wavBase64 } from '@/lib/pcm-wav';
import type { SentenceRecording } from './sentence-recorder';

export const canAssessAudio = () => typeof AudioContext !== 'undefined';

export async function assessmentAudio(recording: SentenceRecording): Promise<SentenceRecording> {
  const context = new AudioContext({ sampleRate: ASSESSMENT_SAMPLE_RATE });
  try {
    const binary = atob(recording.base64);
    const bytes = Uint8Array.from(binary, (letter) => letter.charCodeAt(0));
    const decoded = await context.decodeAudioData(bytes.buffer);
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
