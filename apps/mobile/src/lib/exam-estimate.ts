/**
 * An estimate on a test's own scale (5.18, spec §6.13): a band ("6.5"), points out of a maximum
 * ("15.5 of 25") or a level ("B1", "below A1"). The server keeps it as text; numbers are shown
 * in the learner's own number format. Always an estimate, never an official result.
 */

export interface ExamScale {
  kind: 'band' | 'points' | 'level';
  low: number;
  high: number;
  step: number;
  levels: string[];
}

/** What to say: an i18n key under `exams.result` and the values its text needs. */
export type EstimateLine =
  | { key: 'estimateBand'; value: string }
  | { key: 'estimatePoints'; value: string; max: string }
  | { key: 'estimateLevel'; value: string }
  | { key: 'estimateBelow'; level: string };

// A level below the lowest a test places at is stored as "below_A1".
const BELOW = 'below_';

export function estimateLine(
  scale: ExamScale | null | undefined,
  estimate: string | null | undefined,
  locale: string,
): EstimateLine | null {
  if (!scale || !estimate) return null;
  if (scale.kind === 'level') {
    return estimate.startsWith(BELOW)
      ? { key: 'estimateBelow', level: estimate.slice(BELOW.length) }
      : { key: 'estimateLevel', value: estimate };
  }
  const value = Number(estimate);
  if (!Number.isFinite(value)) return null;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return scale.kind === 'band'
    ? { key: 'estimateBand', value: number.format(value) }
    : { key: 'estimatePoints', value: number.format(value), max: number.format(scale.high) };
}
