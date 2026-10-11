import { dueDay, waitOf } from './card-times';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('waitOf', () => {
  it.each([
    [10 * MINUTE, { unit: 'minutes', count: 10 }],
    [20, { unit: 'minutes', count: 1 }],
    [59 * MINUTE, { unit: 'minutes', count: 59 }],
    [HOUR, { unit: 'hours', count: 1 }],
    [9.7 * HOUR, { unit: 'hours', count: 10 }],
    [DAY, { unit: 'days', count: 1 }],
    [2 * DAY, { unit: 'days', count: 2 }],
    [29 * DAY, { unit: 'days', count: 29 }],
    [30 * DAY, { unit: 'months', count: 1 }],
    [159 * DAY, { unit: 'months', count: 5 }],
    [365 * DAY, { unit: 'years', count: 1 }],
    [36500 * DAY, { unit: 'years', count: 100 }],
  ] as const)('reads %d seconds in the unit a person would use', (seconds, wait) => {
    expect(waitOf(seconds)).toEqual(wait);
  });
});

describe('dueDay', () => {
  // The device's clock: a Friday afternoon.
  const now = new Date(2026, 9, 9, 15, 30);
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).toISOString();

  it('is now for a card whose time has come', () => {
    expect(dueDay(at(9, 15), now)).toEqual({ when: 'now' });
    expect(dueDay(at(2, 8), now)).toEqual({ when: 'now' });
    expect(dueDay(now.toISOString(), now)).toEqual({ when: 'now' });
  });

  it('is later today, tomorrow, or in so many days, by the calendar', () => {
    expect(dueDay(at(9, 23), now)).toEqual({ when: 'today' });
    // Nine hours away, and already tomorrow.
    expect(dueDay(at(10, 0), now)).toEqual({ when: 'tomorrow' });
    expect(dueDay(at(10, 23), now)).toEqual({ when: 'tomorrow' });
    expect(dueDay(at(11, 0), now)).toEqual({ when: 'days', count: 2 });
    expect(dueDay(at(20, 9), now)).toEqual({ when: 'days', count: 11 });
  });
});
