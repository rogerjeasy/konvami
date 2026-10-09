import { formatDate, formatDuration, formatPercent, monthNames, weekdayInitials } from './format';

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
