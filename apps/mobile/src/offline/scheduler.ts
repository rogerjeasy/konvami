import type { Rating } from '@konvami/api-client';

/** FSRS-6 default parameters, shared with services/api/domain/fsrs.py. */
const W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
] as const;
const GRADES = { again: 1, hard: 2, good: 3, easy: 4 } as const;
const MIN_STABILITY = 0.001;
const MAX_INTERVAL_DAYS = 36500;
const DECAY = -W[20];
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
export interface CardMemory {
  stability: number;
  difficulty: number;
}
const clampDifficulty = (value: number) => Math.min(10, Math.max(1, value));
const firstDifficulty = (grade: number) => W[4] - Math.exp(W[5] * (grade - 1)) + 1;

export function reviewMemory(memory: CardMemory | null, days: number, rating: Rating): CardMemory {
  const grade = GRADES[rating];
  if (!memory)
    return {
      stability: Math.max(W[grade - 1] ?? MIN_STABILITY, MIN_STABILITY),
      difficulty: clampDifficulty(firstDifficulty(grade)),
    };
  let stability: number;
  if (days < 1) {
    let change = Math.exp(W[17] * (grade - 3 + W[18])) * Math.pow(memory.stability, -W[19]);
    if (grade > 1) change = Math.max(change, 1);
    stability = memory.stability * change;
  } else {
    const recall = Math.pow(1 + (FACTOR * days) / memory.stability, DECAY);
    if (grade === 1) {
      const relearned =
        W[11] *
        Math.pow(memory.difficulty, -W[12]) *
        (Math.pow(memory.stability + 1, W[13]) - 1) *
        Math.exp((1 - recall) * W[14]);
      stability = Math.min(relearned, memory.stability / Math.exp(W[17] * W[18]));
    } else {
      const growth =
        Math.exp(W[8]) *
        (11 - memory.difficulty) *
        Math.pow(memory.stability, -W[9]) *
        (Math.exp((1 - recall) * W[10]) - 1) *
        (grade === 2 ? W[15] : 1) *
        (grade === 4 ? W[16] : 1);
      stability = memory.stability * (1 + growth);
    }
  }
  const moved = memory.difficulty + ((10 - memory.difficulty) * -W[6] * (grade - 3)) / 9;
  return {
    stability: Math.max(stability, MIN_STABILITY),
    difficulty: clampDifficulty(W[7] * firstDifficulty(4) + (1 - W[7]) * moved),
  };
}

export function intervalDays(memory: CardMemory): number {
  const value = (memory.stability / FACTOR) * (Math.pow(0.9, 1 / DECAY) - 1);
  // Python's round uses ties-to-even; JS rounds ties up, which would drift after replay.
  const floor = Math.floor(value);
  const rounded = value - floor === 0.5 ? floor + (floor % 2) : Math.round(value);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, rounded));
}
