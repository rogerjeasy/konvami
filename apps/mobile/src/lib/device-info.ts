import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { FeedbackDevice } from '@konvami/api-client';

/**
 * What a learner may send along with feedback, if they tick the box: the app version, the system
 * version and whether this is iOS, Android or the web. Nothing that identifies the phone.
 */
export function deviceInfo(): FeedbackDevice {
  return {
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    osVersion: String(Platform.Version),
  };
}
