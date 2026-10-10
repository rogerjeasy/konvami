import { addMonths, dateChoices, daysInMonth, fromIsoDate, toIsoDate, withDatePart } from './dates';

describe('ISO dates', () => {
  it('writes a calendar date with leading zeros', () => {
    expect(toIsoDate({ year: 2027, month: 6, day: 5 })).toBe('2027-06-05');
  });

  it('reads one back', () => {
    expect(fromIsoDate('2027-06-05')).toEqual({ year: 2027, month: 6, day: 5 });
  });

  it.each(['', 'next June', '2027-13-01', '2027-02-30', '2027-6-5'])('refuses %j', (text) => {
    expect(fromIsoDate(text)).toBeNull();
  });
});

describe('addMonths', () => {
  it('moves into the next year', () => {
    expect(addMonths({ year: 2026, month: 12, day: 9 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 9,
    });
  });

  it('keeps the day inside a shorter month', () => {
    expect(addMonths({ year: 2027, month: 1, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 2,
      day: 28,
    });
  });
});

describe('dateChoices', () => {
  const years = { from: 2026, to: 2028 };

  it('offers every day of the month, every month and the years in range', () => {
    const choices = dateChoices({ year: 2028, month: 2, day: 10 }, { years });

    expect(choices.days).toHaveLength(29);
    expect(choices.months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(choices.years).toEqual([2026, 2027, 2028]);
  });

  it('offers nothing before the earliest date', () => {
    const min = { year: 2026, month: 10, day: 9 };

    const sameMonth = dateChoices({ year: 2026, month: 10, day: 20 }, { years, min });
    expect(sameMonth.months).toEqual([10, 11, 12]);
    expect(sameMonth.days[0]).toBe(9);

    const later = dateChoices({ year: 2026, month: 11, day: 20 }, { years, min });
    expect(later.days[0]).toBe(1);
    expect(dateChoices({ year: 2027, month: 3, day: 1 }, { years, min }).months).toHaveLength(12);
  });
});

describe('withDatePart', () => {
  it('keeps the day inside the new month', () => {
    expect(withDatePart({ year: 2027, month: 3, day: 31 }, 'month', 2)).toEqual({
      year: 2027,
      month: 2,
      day: 28,
    });
  });

  it('never goes before the earliest date', () => {
    const min = { year: 2026, month: 10, day: 9 };

    expect(withDatePart({ year: 2027, month: 3, day: 5 }, 'year', 2026, min)).toEqual(min);
    expect(withDatePart({ year: 2026, month: 11, day: 4 }, 'month', 10, min)).toEqual(min);
  });
});

describe('daysInMonth', () => {
  it('knows month lengths and leap years', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});
