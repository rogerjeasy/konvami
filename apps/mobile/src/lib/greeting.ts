export type DayPart = 'morning' | 'afternoon' | 'evening';

// The hours (0–23) at which the morning and the afternoon begin and the evening sets in.
const MORNING_FROM = 5;
const AFTERNOON_FROM = 12;
const EVENING_FROM = 18;

/** Which greeting an hour of the day calls for. The small hours belong to the evening before. */
export function dayPart(hour: number): DayPart {
  if (hour >= MORNING_FROM && hour < AFTERNOON_FROM) return 'morning';
  if (hour >= AFTERNOON_FROM && hour < EVENING_FROM) return 'afternoon';
  return 'evening';
}
