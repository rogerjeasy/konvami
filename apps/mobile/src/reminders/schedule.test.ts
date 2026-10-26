import type { ReminderNotes, WeekPlan } from '@konvami/api-client';
import { FAKE_EXAM_WEEK, FAKE_PLAN, FAKE_WORD_CARD as WORD } from '@/test/fake-api';
import { DEFAULT_REMINDERS, upcomingReminders, type ReminderSettings } from './schedule';

// Thursday 8 October 2026, 10:00 on the device's clock. The habit's days are Monday, Tuesday,
// Thursday and Saturday: from today, Thursday, Saturday and next week's Monday and Tuesday.
const NOW = new Date(2026, 9, 8, 10, 0);
const PLAN: WeekPlan = {
  ...FAKE_PLAN,
  upcoming: ['2026-10-08', '2026-10-10', '2026-10-12', '2026-10-13'],
};
const NO_NOTES: ReminderNotes = { followUps: [], words: [] };

function remind(
  changes: Partial<WeekPlan> = {},
  {
    settings = DEFAULT_REMINDERS,
    cardsDue = 0,
    practisedToday = false,
    now = NOW,
    notes = NO_NOTES,
  }: {
    settings?: ReminderSettings;
    cardsDue?: number;
    practisedToday?: boolean;
    now?: Date;
    notes?: ReminderNotes;
  } = {},
) {
  return upcomingReminders({
    now,
    plan: { ...PLAN, ...changes },
    notes,
    cardsDue,
    practisedToday,
    settings,
  });
}

const days = (reminders: ReturnType<typeof upcomingReminders>) =>
  reminders.map(({ at, kind }) => [at.toDateString(), at.getHours(), kind]);

describe('the reminders of the next seven days', () => {
  it('reminds on the planned days at the learner’s time, today with today’s plan', () => {
    expect(days(remind())).toEqual([
      ['Thu Oct 08 2026', 18, 'today'],
      ['Sat Oct 10 2026', 18, 'practice'],
      ['Mon Oct 12 2026', 18, 'practice'],
      ['Tue Oct 13 2026', 18, 'practice'],
    ]);
    expect(remind()[0]).toMatchObject({ minutes: 10 });
  });

  it('reminds at most once a day, and never at a time already gone', () => {
    const evening = remind({}, { now: new Date(2026, 9, 8, 19, 0) });

    expect(days(evening).map(([day]) => day)).toEqual([
      'Sat Oct 10 2026',
      'Mon Oct 12 2026',
      'Tue Oct 13 2026',
    ]);
  });

  it('says nothing today once the learner has practised, or today’s plan is done', () => {
    expect(days(remind({}, { practisedToday: true }))[0]?.[0]).toBe('Sat Oct 10 2026');
    expect(days(remind({ today: [], reason: 'today_done' }))[0]?.[0]).toBe('Sat Oct 10 2026');
  });

  it('leaves the rest of a week that is done, or out of voice minutes, to next week', () => {
    for (const reason of ['week_done', 'minutes_used_up'] as const) {
      expect(days(remind({ reason, today: [] })).map(([day]) => day)).toEqual([
        'Mon Oct 12 2026',
        'Tue Oct 13 2026',
      ]);
    }
  });

  it('reminds of the cards once, on the first day without practice', () => {
    expect(days(remind({}, { cardsDue: 6 }))).toContainEqual(['Fri Oct 09 2026', 18, 'cards']);
    expect(days(remind({}, { cardsDue: 6 })).filter(([, , kind]) => kind === 'cards')).toHaveLength(
      1,
    );
    expect(
      days(remind({}, { cardsDue: 6, settings: { ...DEFAULT_REMINDERS, cards: false } })),
    ).not.toContainEqual(['Fri Oct 09 2026', 18, 'cards']);
    expect(days(remind({}, { cardsDue: 0 }))).not.toContainEqual(['Fri Oct 09 2026', 18, 'cards']);
  });

  it('names a simulation still to do on the week’s next planned day', () => {
    const exam = { ...FAKE_EXAM_WEEK, simulations: 1, done: 0 };

    // Today's plan is a conversation: Saturday is the simulation's day.
    expect(days(remind({ exam })).slice(0, 2)).toEqual([
      ['Thu Oct 08 2026', 18, 'today'],
      ['Sat Oct 10 2026', 18, 'simulation'],
    ]);
    // Next week's days are ordinary until the plan says more.
    expect(days(remind({ exam }))[2]).toEqual(['Mon Oct 12 2026', 18, 'practice']);
  });

  it('calls today a simulation when today’s plan starts with one', () => {
    const simulation = {
      kind: 'exam',
      minutes: 10,
      topic: null,
      scenario: null,
      exam: 'goethe_b1',
    } as const;

    expect(remind({ today: [simulation], exam: FAKE_EXAM_WEEK })[0]).toMatchObject({
      kind: 'simulation',
    });
  });

  it('reminds of nothing once the learner turned reminders off', () => {
    expect(remind({}, { cardsDue: 6, settings: { ...DEFAULT_REMINDERS, on: false } })).toEqual([]);
  });

  it('gives each reminder its day as its id, so a new schedule replaces the old one', () => {
    expect(remind().map(({ id }) => id)).toEqual([
      'reminder-2026-10-08',
      'reminder-2026-10-10',
      'reminder-2026-10-12',
      'reminder-2026-10-13',
    ]);
  });

  it('asks how an event went on the day after it, in place of that day’s reminder', () => {
    const notes = {
      ...NO_NOTES,
      followUps: [{ day: '2026-10-10', text: 'Alors, cet entretien ?' }],
    };

    const saturday = remind({}, { notes })[1];

    expect(saturday).toMatchObject({ kind: 'followUp', ask: 'Alors, cet entretien ?' });
    expect(saturday?.at.toDateString()).toBe('Sat Oct 10 2026');
    // Turned off, Saturday is a practice day again.
    expect(remind({}, { notes, settings: { ...DEFAULT_REMINDERS, events: false } })[1]?.kind).toBe(
      'practice',
    );
  });

  it('adds a word of the day to the day’s reminder, or sends it alone on a quiet day', () => {
    const notes = {
      ...NO_NOTES,
      words: ['2026-10-08', '2026-10-09', '2026-10-10'].map((day) => ({ day, card: WORD })),
    };
    const settings = { ...DEFAULT_REMINDERS, word: true };

    const [thursday, friday, saturday] = remind({}, { notes, settings });

    expect(thursday).toMatchObject({ kind: 'today', word: WORD });
    // Friday has no practice and no cards: the word comes alone.
    expect(friday).toMatchObject({ kind: 'word', word: WORD });
    expect(friday?.at.toDateString()).toBe('Fri Oct 09 2026');
    expect(saturday).toMatchObject({ kind: 'practice', word: WORD });
    // Off by default.
    expect(remind({}, { notes }).some((reminder) => reminder.word)).toBe(false);
  });
});
