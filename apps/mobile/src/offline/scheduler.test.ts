import { reviewMemory, intervalDays } from './scheduler';

describe('offline FSRS matches the server', () => {
  it('starts new cards at the published retention intervals', () => {
    expect(
      ['again', 'hard', 'good', 'easy'].map((rating) =>
        intervalDays(reviewMemory(null, 0, rating as 'good')),
      ),
    ).toEqual([1, 1, 2, 8]);
  });
  it('schedules a good first review then good again two days later for eleven days', () => {
    const first = reviewMemory(null, 0, 'good');
    expect(first.stability).toBe(2.3065);
    expect(intervalDays(reviewMemory(first, 2, 'good'))).toBe(11);
  });
  it('does not reduce stability for remembered same-day repetitions', () => {
    const first = reviewMemory(null, 0, 'easy');
    expect(reviewMemory(first, 0, 'hard').stability).toBeGreaterThanOrEqual(first.stability);
  });
  it('rounds midpoint intervals as the Python scheduler does', () => {
    expect(intervalDays({ stability: 2.5, difficulty: 5 })).toBe(2);
    expect(intervalDays({ stability: 3.5, difficulty: 5 })).toBe(4);
  });
});
