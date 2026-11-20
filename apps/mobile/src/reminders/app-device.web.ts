import type { ReminderDevice } from './device';

/**
 * The web preview cannot schedule notifications: reminders come on the phone app. A visual
 * check (`.playwright-mcp/check`) may stand in for a phone by setting
 * `__konvamiReminderDevice` before the app loads.
 */
const standIn = (globalThis as { __konvamiReminderDevice?: ReminderDevice })
  .__konvamiReminderDevice;

const unsupported: ReminderDevice = {
  permission: async () => 'unsupported',
  ask: async () => 'unsupported',
  replace: async () => {},
  snooze: async () => {},
  clear: async () => {},
  pushToken: async () => null,
  onOpen: () => () => {},
};

// A stand-in written before a method existed gets the web's own for it.
export const appReminderDevice: ReminderDevice = standIn
  ? { ...unsupported, ...standIn }
  : unsupported;
