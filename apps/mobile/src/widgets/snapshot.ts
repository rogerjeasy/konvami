import type { Home } from '@konvami/api-client';
import { upcomingReminders, type ReminderSettings } from '@/reminders/schedule';

/**
 * What the home-screen widget shows (design note 2026-11-20-partner-calls): the streak, the next
 * planned practice (a ring or a reminder, with the partner's name), and "Talk now", which opens a
 * call with the partner Today suggests. Worked out from Today's data on the device, like the
 * reminders, and handed to the widget as a timeline so it moves on to the next planned time by
 * itself after one has passed.
 */
export interface WidgetProps {
  /** Days in a row with practice, as Today counts them. */
  streakDays: number;
  /** Whether the learner has practised today (the streak is safe). */
  practisedToday: boolean;
  /** The next planned practice, or null when nothing is planned in the next seven days. */
  next: { at: string; partner: string; ring: boolean } | null;
  /** The partner "Talk now" calls, or null before the learner has one. */
  partner: string | null;
  /** Where "Talk now" leads: a call with that partner, or the app's Today. */
  url: string;
}

export interface WidgetEntry {
  /** When the entry starts to show (ISO). */
  date: string;
  props: WidgetProps;
}

// The app's own address (app.config.ts `scheme`): the widget opens screens through it.
const SCHEME = 'konvami://';

/** Where "Talk now" leads: a call with `partnerId` (5.3), or Today without a partner. */
export function talkNowUrl(partnerId: string | null): string {
  return partnerId ? `${SCHEME}call/${encodeURIComponent(partnerId)}` : `${SCHEME}today`;
}

/**
 * The widget's timeline from now: one entry now and one as each planned time passes, each
 * naming the next one still ahead. With reminders off (or not chosen) the planned days still
 * show, at the learner's default time, but none rings.
 */
export function widgetTimeline({
  home,
  settings,
  now,
}: {
  home: Home;
  settings: ReminderSettings;
  now: Date;
}): WidgetEntry[] {
  const partner =
    home.partners.find(({ persona }) => persona.id === home.suggestedPartnerId) ?? home.partners[0];
  const planned = upcomingReminders({
    now,
    plan: home.plan,
    notes: home.reminders,
    cardsDue: 0,
    practisedToday: home.activity.practisedToday,
    // Every planned day counts for the widget, rung or not; words and cards are not practice.
    settings: { ...settings, on: true, cards: false, word: false },
  }).filter(({ kind }) => kind !== 'word' && kind !== 'cards');
  const base = {
    streakDays: home.activity.streakDays,
    partner: partner?.persona.name ?? null,
    url: talkNowUrl(partner?.persona.id ?? null),
  };
  const nextFrom = (index: number): WidgetProps['next'] => {
    const reminder = planned[index];
    if (!reminder || !partner) return null;
    return {
      at: reminder.at.toISOString(),
      partner: partner.persona.name,
      ring: settings.on && reminder.kind === 'call',
    };
  };
  return [
    {
      date: now.toISOString(),
      props: { ...base, practisedToday: home.activity.practisedToday, next: nextFrom(0) },
    },
    // Once a planned time has passed the widget names the one after it; whether the learner
    // practised is known only when the app opens again, so later entries do not claim it.
    ...planned.map((reminder, index) => ({
      date: reminder.at.toISOString(),
      props: { ...base, practisedToday: false, next: nextFrom(index + 1) },
    })),
  ];
}
