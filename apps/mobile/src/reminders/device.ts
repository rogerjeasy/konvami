/**
 * What reminders need from the phone: the permission to notify, and notifications scheduled on
 * the device itself (no push server). The app provides `appReminderDevice`; tests provide a fake.
 */

/**
 * What a tapped reminder or push opens: a word's card, a report, a simulation's score, a
 * partner's ring (5.28, with the partner's question when it is about an event), or Today.
 */
export type OpenTarget =
  | { open: 'card'; id: string }
  | { open: 'report'; id: string }
  | { open: 'simulation'; id: string }
  | { open: 'call'; partner: string; ask?: string }
  /** A Two Halves case: a clue arrived, or the learner's move was held (7.4). */
  | { open: 'halves'; id: string }
  /** Two Halves' hub: a partner search ended, or the owner wrote about a move (7.1, 7.3). */
  | { open: 'halvesHub' }
  /** Radio Konvami: the learner's call aired in a show (8.2), or was held (its report, 8.4). */
  | { open: 'radio'; id: string }
  | { open: 'radio_call'; id: string }
  | { open: 'today' };

/** What a notification's data says it opens; anything else opens Today. */
export function openTargetOf(data: Record<string, unknown> | undefined): OpenTarget {
  const id = typeof data?.id === 'string' ? data.id : null;
  const card = typeof data?.card === 'string' ? data.card : null;
  if (card) return { open: 'card', id: card };
  if (data?.open === 'call' && typeof data.partner === 'string') {
    return typeof data.ask === 'string'
      ? { open: 'call', partner: data.partner, ask: data.ask }
      : { open: 'call', partner: data.partner };
  }
  const withId = ['report', 'simulation', 'halves', 'radio', 'radio_call'] as const;
  const open = withId.find((one) => one === data?.open);
  if (id && open) return { open, id };
  if (data?.open === 'halves') return { open: 'halvesHub' };
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
  /** A partner's ring (5.28): who rings, and their question when it is about an event. */
  call?: { partner: string; ask?: string };
}

export interface ReminderDevice {
  permission(): Promise<ReminderPermission>;
  /** Asks the system, when it still can; otherwise answers as `permission` would. */
  ask(channel: string): Promise<ReminderPermission>;
  /**
   * Replaces every reminder scheduled before with these (a snoozed one stays). `channel` is what
   * Android's settings call them, `callsChannel` what they call partners' rings (5.28).
   */
  replace(
    reminders: readonly ScheduledReminder[],
    channel: string,
    callsChannel?: string,
  ): Promise<void>;
  /**
   * Schedules one more ring without touching the others ("Remind me in an hour" on 5.28); a
   * later `replace` keeps it. `callsChannel` is what Android's settings call rings.
   */
  snooze(reminder: ScheduledReminder, callsChannel: string): Promise<void>;
  /** Removes every scheduled reminder, snoozed ones included (signing out). */
  clear(): Promise<void>;
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
