import type { ReminderDevice } from './device';

/**
 * The web preview cannot schedule notifications: reminders come on the phone app. A visual
 * check (`.playwright-mcp/check`) may stand in for a phone by setting
 * `__konvamiReminderDevice` before the app loads.
 */
const standIn = (globalThis as { __konvamiReminderDevice?: ReminderDevice })
  .__konvamiReminderDevice;

export const appReminderDevice: ReminderDevice = standIn ?? {
  permission: async () => 'unsupported',
  ask: async () => 'unsupported',
  replace: async () => {},
  onOpen: () => () => {},
};
