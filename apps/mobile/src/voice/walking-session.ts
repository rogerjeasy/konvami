import { AppState, Platform, TurboModuleRegistry } from 'react-native';

export interface WalkingSession {
  start(
    labels: { title: string; detail: string; pause: string; resume: string; stop: string },
    controls: { mute: (value: boolean) => void; stop: () => void },
  ): Promise<void>;
  stop(): void;
}

/** WebRTC retains the microphone; this owns only the native background service and controls. */
export function createWalkingSession(): WalkingSession | null {
  if (Platform.OS === 'web' || TurboModuleRegistry.get('AudioAPIModule') === null) return null;
  // Expo Go must not load a JSI module absent from its binary.
  const { RecordingNotificationManager: notification, AudioManager } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-audio-api') as typeof import('react-native-audio-api');
  let subscriptions: { remove(): void }[] = [];
  let generation = 0;
  const stop = () => {
    generation += 1;
    subscriptions.forEach((subscription) => subscription.remove());
    subscriptions = [];
    if (Platform.OS === 'android') void notification.hide().catch(() => {});
  };
  return {
    stop,
    async start(labels, controls) {
      stop();
      const current = generation;
      // Android forbids starting a microphone service from the background.
      if (AppState.currentState !== 'active') throw new Error('unavailable');
      if (Platform.OS !== 'android') return;
      if ((await AudioManager.requestNotificationPermissions()) !== 'Granted')
        throw new Error('unavailable');
      if (current !== generation) return;
      subscriptions = [
        notification.addEventListener('recordingNotificationPause', () => controls.mute(true)),
        notification.addEventListener('recordingNotificationResume', () => controls.mute(false)),
        notification.addEventListener('recordingNotificationStop', controls.stop),
      ];
      try {
        await notification.show({
          title: labels.title,
          contentText: labels.detail,
          pauseActionTitle: labels.pause,
          resumeActionTitle: labels.resume,
          stopActionTitle: labels.stop,
          showStopAction: true,
          dismissible: false,
          usesChronometer: true,
          paused: false,
        });
        if (current !== generation) await notification.hide();
      } catch (error) {
        stop();
        throw error;
      }
    },
  };
}
