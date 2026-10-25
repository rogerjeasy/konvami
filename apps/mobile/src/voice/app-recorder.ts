import { useMemo } from 'react';
import { Platform } from 'react-native';
import { RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { askForMicrophone } from '@/lib/microphone';
import { RecorderError, type SentenceRecorder } from './sentence-recorder';

// One voice, compressed: a sentence is a few dozen kilobytes to send.
const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64_000 };

/** A file on the device as base64 (the part of its data URL after the comma). */
async function readBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
    reader.readAsDataURL(blob);
  });
}

/** The device's microphone through expo-audio: m4a on a phone, webm in a browser. */
export function useAppSentenceRecorder(): SentenceRecorder {
  const recorder = useAudioRecorder(OPTIONS);
  return useMemo(
    () => ({
      async start() {
        if (!(await askForMicrophone())) throw new RecorderError('mic_denied');
        try {
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
          await recorder.prepareToRecordAsync();
          recorder.record();
        } catch {
          throw new RecorderError('unavailable');
        }
      },
      async stop() {
        const durationMs = recorder.getStatus().durationMillis;
        await recorder.stop();
        // Back to playback, so the "before and after" plays through the speaker.
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
        const uri = recorder.uri;
        if (!uri) return null;
        return {
          uri,
          durationMs,
          format: Platform.OS === 'web' ? 'webm' : 'm4a',
          base64: await readBase64(uri),
        };
      },
    }),
    [recorder],
  );
}
