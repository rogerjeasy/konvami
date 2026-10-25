/**
 * What reminders need from the phone: the permission to notify, and notifications scheduled on
 * the device itself (no push server). The app provides `appReminderDevice`; tests provide a fake.
 */

/** Whether the app may notify: `unsupported` where it cannot schedule at all (the web preview). */
export type ReminderPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** One reminder as the system shows it. */
export interface ScheduledReminder {
  id: string;
  at: Date;
  title: string;
  body: string;
}

export interface ReminderDevice {
  permission(): Promise<ReminderPermission>;
  /** Asks the system, when it still can; otherwise answers as `permission` would. */
  ask(channel: string): Promise<ReminderPermission>;
  /**
   * Replaces every reminder scheduled before with these. `channel` is what Android's settings
   * call them.
   */
  replace(reminders: readonly ScheduledReminder[], channel: string): Promise<void>;
  /** Calls `open` when the learner taps a reminder, also one that started the app. */
  onOpen(open: () => void): () => void;
}
