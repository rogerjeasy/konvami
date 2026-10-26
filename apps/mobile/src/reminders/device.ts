/**
 * What reminders need from the phone: the permission to notify, and notifications scheduled on
 * the device itself (no push server). The app provides `appReminderDevice`; tests provide a fake.
 */

/** What a tapped reminder or push opens: a word's card, a report, a simulation's score, or Today. */
export type OpenTarget =
  | { open: 'card'; id: string }
  | { open: 'report'; id: string }
  | { open: 'simulation'; id: string }
  | { open: 'today' };

/** What a notification's data says it opens; anything else opens Today. */
export function openTargetOf(data: Record<string, unknown> | undefined): OpenTarget {
  const id = typeof data?.id === 'string' ? data.id : null;
  const card = typeof data?.card === 'string' ? data.card : null;
  if (card) return { open: 'card', id: card };
  if (id && (data?.open === 'report' || data?.open === 'simulation')) {
    return { open: data.open, id };
  }
  return { open: 'today' };
}

/** Whether the app may notify: `unsupported` where it cannot schedule at all (the web preview). */
export type ReminderPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** One reminder as the system shows it. */
export interface ScheduledReminder {
  id: string;
  at: Date;
  title: string;
  body: string;
  /** The card a word of the day opens; without one, a tap opens Today. */
  card?: string;
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
  /**
   * This phone's address for push from the server, and its platform; `null` where there is none
   * (the web preview, or a build without push credentials).
   */
  pushToken(): Promise<{ token: string; platform: 'ios' | 'android' } | null>;
  /**
   * Calls `open` when the learner taps a reminder or a push, also one that started the app, with
   * what it opens.
   */
  onOpen(open: (target: OpenTarget) => void): () => void;
}
