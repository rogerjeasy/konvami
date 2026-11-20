import type { Rating } from '@konvami/api-client';

/**
 * FSRS-6, shared with services/api/domain/fsrs.py. The 21 parameters are the published defaults
 * unless the server fitted the learner's own (`getCardsAhead().weights`); the phone schedules
 * offline reviews with whatever the server uses, so a synced card does not move.
 */
export const DEFAULT_WEIGHTS: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];
// The share of cards a learner should still know when one comes back (the server's RETENTION).
export const DEFAULT_RETENTION = 0.9;
const WEIGHT_COUNT = 21;
const GRADES = { again: 1, hard: 2, good: 3, easy: 4 } as const;
const MIN_STABILITY = 0.001;
const MAX_INTERVAL_DAYS = 36500;
export interface CardMemory {
  stability: number;
  difficulty: number;
}

/** The parameters to schedule with: the learner's own when the server sent a full set. */
export function scheduleWeights(weights: readonly number[] | null | undefined): readonly number[] {
  return weights && weights.length === WEIGHT_COUNT ? weights : DEFAULT_WEIGHTS;
}

const at = (w: readonly number[], index: number) => w[index] ?? 0;
const decay = (w: readonly number[]) => -at(w, 20);
const factor = (w: readonly number[]) => Math.pow(0.9, 1 / decay(w)) - 1;
const clampDifficulty = (value: number) => Math.min(10, Math.max(1, value));
const firstDifficulty = (w: readonly number[], grade: number) =>
  at(w, 4) - Math.exp(at(w, 5) * (grade - 1)) + 1;

export function reviewMemory(
  memory: CardMemory | null,
  days: number,
  rating: Rating,
  weights: readonly number[] = DEFAULT_WEIGHTS,
): CardMemory {
  const w = weights;
  const grade = GRADES[rating];
  if (!memory)
    return {
      stability: Math.max(at(w, grade - 1), MIN_STABILITY),
      difficulty: clampDifficulty(firstDifficulty(w, grade)),
    };
  let stability: number;
  if (days < 1) {
    let change =
      Math.exp(at(w, 17) * (grade - 3 + at(w, 18))) * Math.pow(memory.stability, -at(w, 19));
    if (grade > 1) change = Math.max(change, 1);
    stability = memory.stability * change;
  } else {
    const recall = Math.pow(1 + (factor(w) * days) / memory.stability, decay(w));
    if (grade === 1) {
      const relearned =
        at(w, 11) *
        Math.pow(memory.difficulty, -at(w, 12)) *
        (Math.pow(memory.stability + 1, at(w, 13)) - 1) *
        Math.exp((1 - recall) * at(w, 14));
      stability = Math.min(relearned, memory.stability / Math.exp(at(w, 17) * at(w, 18)));
    } else {
      const growth =
        Math.exp(at(w, 8)) *
        (11 - memory.difficulty) *
        Math.pow(memory.stability, -at(w, 9)) *
        (Math.exp((1 - recall) * at(w, 10)) - 1) *
        (grade === 2 ? at(w, 15) : 1) *
        (grade === 4 ? at(w, 16) : 1);
      stability = memory.stability * (1 + growth);
    }
  }
  const moved = memory.difficulty + ((10 - memory.difficulty) * -at(w, 6) * (grade - 3)) / 9;
  return {
    stability: Math.max(stability, MIN_STABILITY),
    difficulty: clampDifficulty(at(w, 7) * firstDifficulty(w, 4) + (1 - at(w, 7)) * moved),
  };
}

export function intervalDays(
  memory: CardMemory,
  weights: readonly number[] = DEFAULT_WEIGHTS,
  retention: number = DEFAULT_RETENTION,
): number {
  const value =
    (memory.stability / factor(weights)) * (Math.pow(retention, 1 / decay(weights)) - 1);
  // Python's round uses ties-to-even; JS rounds ties up, which would drift after replay.
  const floor = Math.floor(value);
  const rounded = value - floor === 0.5 ? floor + (floor % 2) : Math.round(value);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, rounded));
}
