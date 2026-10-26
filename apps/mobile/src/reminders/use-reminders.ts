import { useEffect } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Home } from '@konvami/api-client';
import { useSession } from '@/auth';
import { learnCardRoute, ROUTES } from '@/lib/routes';
import { usePreferences } from '@/preferences';
import type { ScheduledReminder } from './device';
import { upcomingReminders, type Reminder } from './schedule';
import { useReminderDevice, useReminderPermission } from './services';

/**
 * A reminder's words: from the partner Today suggests, in the app's language, never a reproach.
 * The word of the day joins the day's reminder on a line of its own, or comes alone.
 */
function useReminderWords(home: Home | null) {
  const { t } = useTranslation();
  const partner =
    home?.partners.find(({ persona }) => persona.id === home.suggestedPartnerId) ??
    home?.partners[0];
  const title = partner?.persona.name ?? t('common.appName');
  return (reminder: Reminder): ScheduledReminder => {
    const { word } = reminder;
    const wordLine = word
      ? t('reminders.word.line', { word: word.front, meaning: word.back })
      : null;
    if (reminder.kind === 'word' && word) {
      return {
        id: reminder.id,
        at: reminder.at,
        title: t('reminders.word.title'),
        body: t('reminders.word.alone', { word: word.front, meaning: word.back }),
        card: word.id,
      };
    }
    const body =
      reminder.kind === 'followUp' && reminder.ask
        ? reminder.ask
        : reminder.kind === 'today'
          ? t('reminders.body.today', {
              minutes: t('time.minutes', { count: reminder.minutes ?? 0 }),
            })
          : reminder.kind === 'simulation' && home?.plan.exam
            ? t('reminders.body.simulation', { name: home.plan.exam.name })
            : reminder.kind === 'cards'
              ? t('reminders.body.cards')
              : t('reminders.body.practice');
    return {
      id: reminder.id,
      at: reminder.at,
      title,
      body: wordLine ? `${body}\n${wordLine}` : body,
    };
  };
}

/**
 * Keeps the device's reminders in step with Today: scheduled again for the next seven days
 * whenever the plan, the cards or the learner's choice change, once the phone allows them.
 * Turned off, none is left scheduled.
 */
export function useReminderSchedule(home: Home | null, now: Date) {
  const { t } = useTranslation();
  const device = useReminderDevice();
  const { permission } = useReminderPermission();
  const { reminders: settings } = usePreferences();
  const words = useReminderWords(home);
  const scheduled =
    home && settings && permission === 'granted'
      ? upcomingReminders({
          now,
          plan: home.plan,
          notes: home.reminders,
          cardsDue: home.cardsDue,
          practisedToday: home.activity.practisedToday,
          settings,
        }).map(words)
      : null;
  // Scheduled again only when what the reminders say changes, not on every render: the
  // schedule travels to the effect as its own text.
  const key = scheduled ? JSON.stringify(scheduled) : null;
  useEffect(() => {
    if (key === null) return;
    const reminders = (JSON.parse(key) as (Omit<ScheduledReminder, 'at'> & { at: string })[]).map(
      (reminder) => ({ ...reminder, at: new Date(reminder.at) }),
    );
    void device.replace(reminders, t('reminders.channel')).catch(() => {});
  }, [device, key, t]);
}

/**
 * For the whole app: a tapped reminder opens Today, and a learner who signs out (or deletes
 * their account) is reminded of nothing more on this device.
 */
export function ReminderKeeper() {
  const { t } = useTranslation();
  const device = useReminderDevice();
  const { status } = useSession();
  useEffect(
    () => device.onOpen((card) => router.navigate(card ? learnCardRoute(card) : ROUTES.today)),
    [device],
  );
  useEffect(() => {
    if (status === 'signedOut') void device.replace([], t('reminders.channel')).catch(() => {});
  }, [device, status, t]);
  return null;
}
