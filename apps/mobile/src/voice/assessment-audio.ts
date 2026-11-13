import { encodeAssessmentWav, wavBase64 } from '@/lib/pcm-wav';
import { canDecodeAudio, decodeAudio } from './decoded-audio';
import type { SentenceRecording } from './sentence-recorder';

export const canAssessAudio = canDecodeAudio;

/** Decode and resample locally before encoding PCM; compressed audio is never mislabeled. */
export async function assessmentAudio(
  recording: SentenceRecording | string,
): Promise<SentenceRecording> {
  const decoded = await decodeAudio(recording);
  return {
    ...(typeof recording === 'string' ? { uri: recording } : recording),
    base64: wavBase64(encodeAssessmentWav(decoded.channels, decoded.sampleRate)),
    format: 'wav',
    durationMs: decoded.durationMs,
  };
}
