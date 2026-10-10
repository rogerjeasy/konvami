import { dayPart } from './greeting';

describe('dayPart', () => {
  it.each([
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [23, 'evening'],
    // The small hours still belong to the evening before: nobody is greeted "good morning" at 2.
    [0, 'evening'],
    [4, 'evening'],
  ] as const)('%i o’clock is the %s', (hour, part) => {
    expect(dayPart(hour)).toBe(part);
  });
});
