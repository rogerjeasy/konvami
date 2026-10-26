import { useEffect } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Home, PushDevice } from '@konvami/api-client';
import { useAuthServices, useSession } from '@/auth';
import { learnCardRoute, reportRoute, ROUTES, simulationRoute } from '@/lib/routes';
import { usePracticeServices } from '@/practice/services';
import { usePreferences } from '@/preferences';
import type { OpenTarget, ScheduledReminder } from './device';
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

/** Where a tapped reminder or push leads. */
function routeOf(target: OpenTarget) {
  switch (target.open) {
    case 'card':
      return learnCardRoute(target.id);
    case 'report':
      return reportRoute(target.id);
    case 'simulation':
      return simulationRoute(target.id);
    default:
      return ROUTES.today;
  }
}

/**
 * For the whole app: a tapped reminder or push opens what it is about; the server may reach this
 * phone by push while the learner is signed in, the phone allows it and reminders are on, and not
 * once they are turned off; a learner who signs out (or deletes their account) is reminded of
 * nothing more and reached no more on this device.
 */
export function ReminderKeeper() {
  const { t, i18n } = useTranslation();
  const device = useReminderDevice();
  const { permission } = useReminderPermission();
  const { reminders: settings } = usePreferences();
  const { session } = useAuthServices();
  const { status } = useSession();
  const { push, clock } = usePracticeServices();
  const on = settings?.on ?? null;
  const time = settings?.time ?? null;

  useEffect(() => device.onOpen((target) => router.navigate(routeOf(target))), [device]);
  useEffect(() => {
    if (status === 'signedOut') void device.replace([], t('reminders.channel')).catch(() => {});
  }, [device, status, t]);

  useEffect(() => {
    if (status !== 'signedIn' || permission !== 'granted' || on === null || time === null) return;
    let live = true;
    void device.pushToken().then((found) => {
      if (!found || !live) return;
      const done = on
        ? push.register({
            token: found.token,
            platform: found.platform,
            timeZone: clock.timeZone() ?? 'UTC',
            language: i18n.language as PushDevice['language'],
            time,
          })
        : push.remove(found.token);
      done.catch(() => {});
    });
    return () => {
      live = false;
    };
  }, [device, status, permission, on, time, i18n.language, push, clock]);

  // Before signing out, while the account can still be reached.
  useEffect(
    () =>
      session.beforeSignOut(async () => {
        const found = await device.pushToken();
        if (found) await push.remove(found.token);
      }),
    [session, device, push],
  );
  return null;
}
