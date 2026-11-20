import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Rating } from '@konvami/api-client';
import {
  reviewMemory,
  intervalDays,
  scheduleWeights,
  DEFAULT_WEIGHTS,
  type CardMemory,
} from './scheduler';

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

interface SharedStep {
  days: number;
  rating: Rating;
  stability: number;
  difficulty: number;
  interval: number;
}

// The histories the server's scheduler is checked against too: services/api/tests/domain/
// fsrs_cases.py writes them from fsrs.py. When this fails, the app and the server disagree on
// when a card comes back, and a card reviewed offline would move once it is synced.
const SHARED_CASES = join(__dirname, '../../../../services/api/tests/fixtures/fsrs_cases.json');
const shared = JSON.parse(readFileSync(SHARED_CASES, 'utf8')) as SharedStep[][];
// Both sides use IEEE doubles and the same formulas; this only allows for the order of operations.
const DIGITS = 9;

describe('the review histories shared with the server', () => {
  it('has histories to check', () => {
    expect(shared.length).toBeGreaterThan(10);
  });
  it.each(shared.map((history, index) => [index, history] as const))(
    'schedules history %i as the server does',
    (_index, history) => {
      let memory: CardMemory | null = null;
      for (const step of history) {
        memory = reviewMemory(memory, step.days, step.rating);
        expect(memory.stability).toBeCloseTo(step.stability, DIGITS);
        expect(memory.difficulty).toBeCloseTo(step.difficulty, DIGITS);
        expect(intervalDays(memory)).toBe(step.interval);
      }
    },
  );
});

interface FittedCases {
  weights: number[];
  retention: number;
  histories: SharedStep[][];
}

// A learner's own fitted parameters and a lower retention, as the server sends them with the
// offline cards: the same file the server's scheduler is checked against.
const FITTED_CASES = join(
  __dirname,
  '../../../../services/api/tests/fixtures/fsrs_fitted_cases.json',
);
const fitted = JSON.parse(readFileSync(FITTED_CASES, 'utf8')) as FittedCases;

describe("the review histories with a learner's own parameters", () => {
  it('uses parameters that differ from the defaults', () => {
    expect(fitted.weights).toHaveLength(21);
    expect(fitted.weights).not.toEqual(DEFAULT_WEIGHTS);
  });
  it.each(fitted.histories.map((history, index) => [index, history] as const))(
    'schedules history %i as the server does',
    (_index, history) => {
      let memory: CardMemory | null = null;
      for (const step of history) {
        memory = reviewMemory(memory, step.days, step.rating, fitted.weights);
        expect(memory.stability).toBeCloseTo(step.stability, DIGITS);
        expect(memory.difficulty).toBeCloseTo(step.difficulty, DIGITS);
        expect(intervalDays(memory, fitted.weights, fitted.retention)).toBe(step.interval);
      }
    },
  );
});

describe('the parameters to schedule with', () => {
  it('are the defaults unless the server sent a full set', () => {
    expect(scheduleWeights(null)).toBe(DEFAULT_WEIGHTS);
    expect(scheduleWeights(undefined)).toBe(DEFAULT_WEIGHTS);
    expect(scheduleWeights([1, 2, 3])).toBe(DEFAULT_WEIGHTS);
    expect(scheduleWeights(fitted.weights)).toBe(fitted.weights);
  });
});
