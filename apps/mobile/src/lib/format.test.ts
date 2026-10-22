import {
  daysAgo,
  formatClock,
  formatDate,
  formatDayLine,
  formatDayOfYear,
  formatDuration,
  formatMonth,
  formatUsd,
  formatPercent,
  formatShortDate,
  monthNames,
  weekdayInitials,
  weekdayNames,
  wholeMinutes,
} from './format';

describe('weekdayInitials', () => {
  it('starts on Monday in English', () => {
    expect(weekdayInitials('en')).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  it('follows the language', () => {
    expect(weekdayInitials('de')[0]).toBe('M');
    expect(weekdayInitials('fr')[0]).toBe('L');
  });
});

describe('formatPercent', () => {
  it('rounds to a whole percent', () => {
    expect(formatPercent('en', 0.68)).toBe('68%');
  });
});

describe('formatDuration', () => {
  it('pads seconds', () => {
    expect(formatDuration(4)).toBe('0:04');
    expect(formatDuration(75)).toBe('1:15');
  });
});

describe('monthNames', () => {
  it('lists the twelve months in the given language, January first', () => {
    expect(monthNames('en')).toEqual([
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]);
    expect(monthNames('de')[2]).toBe('März');
    expect(monthNames('fr')[7]).toBe('août');
  });

  it('can give short names for narrow spaces', () => {
    expect(monthNames('en', 'short')[8]).toBe('Sep');
  });
});

describe('formatDate', () => {
  it.each([
    ['en', 'June 15, 2027'],
    ['de', '15. Juni 2027'],
    ['fr', '15 juin 2027'],
    ['it', '15 giugno 2027'],
  ])('writes a calendar date in full in %s', (locale, expected) => {
    expect(formatDate(locale, '2027-06-15')).toBe(expected);
  });

  it('keeps the calendar day whatever the device time zone', () => {
    expect(formatDate('en', '2027-01-01')).toBe('January 1, 2027');
    expect(formatDate('en', '2027-12-31')).toBe('December 31, 2027');
  });
});

describe('formatDayOfYear', () => {
  it.each([
    ['en', 'Oct 5'],
    ['de', '5. Okt.'],
    ['fr', '5 oct.'],
    ['it', '5 ott'],
  ])('writes a calendar date in a few characters in %s', (locale, expected) => {
    expect(formatDayOfYear(locale, '2026-10-05')).toBe(expected);
  });

  it('keeps the calendar day whatever the device time zone', () => {
    expect(formatDayOfYear('en', '2027-01-01')).toBe('Jan 1');
    expect(formatDayOfYear('en', '2027-12-31')).toBe('Dec 31');
  });
});

describe('wholeMinutes', () => {
  it.each([
    [0, 0],
    // Any practice at all counts as a minute: "0 min" would read as nothing.
    [1, 1],
    [59, 1],
    [89, 1],
    [90, 2],
    [600, 10],
    [1500, 25],
  ])('%i seconds are %i minutes', (seconds, minutes) => {
    expect(wholeMinutes(seconds)).toBe(minutes);
  });
});

describe('formatDayLine', () => {
  const friday = new Date(2026, 9, 9, 18, 30);

  it('writes the weekday, day and month in the language', () => {
    expect(formatDayLine('en-GB', friday)).toBe('Friday 9 October');
    expect(formatDayLine('de', friday)).toBe('Freitag, 9. Oktober');
    expect(formatDayLine('fr', friday)).toBe('vendredi 9 octobre');
  });
});

describe('daysAgo', () => {
  const now = new Date(2026, 9, 9, 8, 0);

  it.each([
    ['earlier today', new Date(2026, 9, 9, 0, 5), 0],
    // Calendar days, not 24-hour spans: late last night was yesterday.
    ['late last night', new Date(2026, 9, 8, 23, 55), 1],
    ['yesterday morning', new Date(2026, 9, 8, 6, 0), 1],
    ['a week ago', new Date(2026, 9, 2, 12, 0), 7],
    ['across a month end', new Date(2026, 8, 30, 12, 0), 9],
  ])('%s', (_, then, days) => {
    expect(daysAgo(then.toISOString(), now)).toBe(days);
  });

  it('never counts a moment in the future as days ago', () => {
    expect(daysAgo(new Date(2026, 9, 10, 9, 0).toISOString(), now)).toBe(0);
  });
});

describe('formatShortDate', () => {
  it('writes a day without the weekday, and the year only when it is another one', () => {
    const now = new Date(2026, 9, 9, 8, 0);

    expect(formatShortDate('en-GB', new Date(2026, 8, 30, 12).toISOString(), now)).toBe('30 Sept');
    expect(formatShortDate('en-GB', new Date(2025, 11, 24, 12).toISOString(), now)).toBe(
      '24 Dec 2025',
    );
    expect(formatShortDate('de', new Date(2026, 8, 30, 12).toISOString(), now)).toBe('30. Sept.');
  });
});

describe('formatClock', () => {
  it('writes the time of day the way the language does', () => {
    const afternoon = new Date(2026, 9, 9, 14, 5).toISOString();

    expect(formatClock('de', afternoon)).toBe('14:05');
    expect(formatClock('en-US', afternoon)).toMatch(/^2:05\sPM$/);
  });
});

describe('weekdayNames', () => {
  it('names the days in full, Monday first, in the language', () => {
    expect(weekdayNames('en')).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    expect(weekdayNames('de')[2]).toBe('Mittwoch');
  });
});

describe('formatUsd', () => {
  it('writes dollars with cents, as the language writes money', () => {
    expect(formatUsd('en', 162.4)).toBe('$162.40');
    expect(formatUsd('de', 1234.5)).toMatch(/^1\.234,50\s\$$/);
  });
});

describe('formatMonth', () => {
  it('names a month and its year from its first day', () => {
    expect(formatMonth('en', '2026-10-01')).toBe('October 2026');
    expect(formatMonth('de', '2026-03-01')).toBe('März 2026');
  });
});
