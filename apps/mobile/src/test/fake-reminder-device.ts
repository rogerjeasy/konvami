import type { ReminderDevice, ReminderPermission, ScheduledReminder } from '@/reminders/device';

export interface FakeReminderDevice extends ReminderDevice {
  /** What the phone allows now, and what it answers when asked. */
  allowed: ReminderPermission;
  answer: ReminderPermission;
  asked: number;
  /** The reminders scheduled last, and the channel name they came with. */
  scheduled: ScheduledReminder[];
  channel: string | null;
  /** Taps a reminder, as the learner would; one of a word of the day opens its card. */
  tap(card?: string): void;
}

export function createFakeReminderDevice(
  allowed: ReminderPermission = 'undetermined',
  answer: ReminderPermission = 'granted',
): FakeReminderDevice {
  const opened = new Set<(card: string | null) => void>();
  const device: FakeReminderDevice = {
    allowed,
    answer,
    asked: 0,
    scheduled: [],
    channel: null,
    permission: async () => device.allowed,
    async ask() {
      device.asked += 1;
      if (device.allowed === 'undetermined') device.allowed = device.answer;
      return device.allowed;
    },
    async replace(reminders, channel) {
      device.scheduled = [...reminders];
      device.channel = channel;
    },
    onOpen(open) {
      opened.add(open);
      return () => opened.delete(open);
    },
    tap: (card) => opened.forEach((open) => open(card ?? null)),
  };
  return device;
}
