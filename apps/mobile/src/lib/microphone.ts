import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';

/**
 * The microphone permission. The phone remembers the user's answer, so the app reads it from the
 * system instead of keeping its own copy (which would go stale when the user changes it in
 * Settings). Every call fails soft: a failure counts as "not allowed", and the app offers text.
 */

/** Whether the user has already allowed the microphone. Never shows a prompt. */
export async function microphoneAllowed(): Promise<boolean> {
  try {
    return (await getRecordingPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Shows the system prompt (the first time; later it returns the saved answer) and reports it. */
export async function askForMicrophone(): Promise<boolean> {
  try {
    return (await requestRecordingPermissionsAsync()).granted;
  } catch {
    return false;
  }
}
