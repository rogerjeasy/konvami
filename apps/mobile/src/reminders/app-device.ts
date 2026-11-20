import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {
  openTargetOf,
  type ReminderDevice,
  type ReminderPermission,
  type ScheduledReminder,
} from './device';

// Android groups an app's notifications in channels: reminders, and partners' rings (5.28),
// which pop up over other apps (high importance) but never bypass Do Not Disturb.
const CHANNEL = 'reminders';
const CALLS_CHANNEL = 'calls';
// A reminder the learner put off on 5.28 ("in an hour"): kept when the schedule is replaced.
const SNOOZE_PREFIX = 'snooze-';

function permissionOf(status: Notifications.NotificationPermissionsStatus): ReminderPermission {
  if (Platform.OS === 'ios') {
    const ios = status.ios?.status;
    if (
      ios === Notifications.IosAuthorizationStatus.AUTHORIZED ||
      ios === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      ios === Notifications.IosAuthorizationStatus.EPHEMERAL
    ) {
      return 'granted';
    }
    return ios === Notifications.IosAuthorizationStatus.DENIED ? 'denied' : 'undetermined';
  }
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

// Android 13 shows the permission prompt only once a channel exists; its name can change later.
function ensureChannel(name: string) {
  return Notifications.setNotificationChannelAsync(CHANNEL, {
    name,
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// The rings' own channel, so the learner can quiet them without quieting reminders.
function ensureCallsChannel(name: string) {
  return Notifications.setNotificationChannelAsync(CALLS_CHANNEL, {
    name,
    importance: Notifications.AndroidImportance.HIGH,
    bypassDnd: false,
  });
}

function schedule(reminder: ScheduledReminder) {
  const { call } = reminder;
  return Notifications.scheduleNotificationAsync({
    identifier: reminder.id,
    content: {
      title: reminder.title,
      body: reminder.body,
      data: call
        ? { open: 'call', partner: call.partner, ...(call.ask ? { ask: call.ask } : {}) }
        : reminder.card
          ? { card: reminder.card }
          : { open: 'today' },
      // iOS shows a ring at once, through a Focus only where the learner allows the app in it.
      ...(call ? { interruptionLevel: 'timeSensitive' as const } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminder.at,
      channelId: call ? CALLS_CHANNEL : CHANNEL,
    },
  });
}

/**
 * Reminders on a phone, with expo-notifications. While the app is open no handler is set, so a
 * reminder due then is not shown: the learner is already here.
 */
export const appReminderDevice: ReminderDevice = {
  async permission() {
    return permissionOf(await Notifications.getPermissionsAsync());
  },
  async ask(channel) {
    await ensureChannel(channel);
    const now = permissionOf(await Notifications.getPermissionsAsync());
    if (now !== 'undetermined') return now;
    return permissionOf(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      }),
    );
  },
  async replace(reminders, channel, callsChannel = channel) {
    await ensureChannel(channel);
    if (reminders.some((reminder) => reminder.call)) await ensureCallsChannel(callsChannel);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const { identifier } of scheduled) {
      if (!identifier.startsWith(SNOOZE_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      }
    }
    for (const reminder of reminders) await schedule(reminder);
  },
  async snooze(reminder, callsChannel) {
    await ensureCallsChannel(callsChannel);
    await schedule({ ...reminder, id: `${SNOOZE_PREFIX}${reminder.id}` });
  },
  async clear() {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },
  async pushToken() {
    // The EAS project the token is made for: Expo's push service sends with its credentials.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;
    try {
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      return { token: data, platform: Platform.OS };
    } catch {
      // A build without push credentials (Firebase on Android, a push key on iOS) has no token.
      return null;
    }
  },
  onOpen(open) {
    const tapped = (response: Notifications.NotificationResponse | null) => {
      if (response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      void Notifications.clearLastNotificationResponseAsync();
      open(openTargetOf(response.notification.request.content.data));
    };
    // A tap that started the app came before this listener.
    void Notifications.getLastNotificationResponseAsync().then(tapped);
    const subscription = Notifications.addNotificationResponseReceivedListener(tapped);
    return () => subscription.remove();
  },
};
