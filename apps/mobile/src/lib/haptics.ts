import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Haptic feedback, one call per user action and always alongside a visual change (many people
 * turn haptics off, and most Android phones are silent). Never on scroll or on entrances the user
 * didn't cause. No-ops on web.
 */
const enabled = Platform.OS !== 'web';

/** A step: the next intro slide, a choice in a list. */
export function stepFeedback(): void {
  if (enabled) void Haptics.selectionAsync().catch(() => {});
}

/** A commitment: finishing the intro, starting sign-up. */
export function commitFeedback(): void {
  if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A success: the account is ready, a word is saved. */
export function successFeedback(): void {
  if (enabled) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
}
