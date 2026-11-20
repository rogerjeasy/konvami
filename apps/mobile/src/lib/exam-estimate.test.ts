import { estimateLine, type ExamScale } from './exam-estimate';

const band: ExamScale = { kind: 'band', low: 0, high: 9, step: 0.5, levels: [] };
const points: ExamScale = { kind: 'points', low: 0, high: 25, step: 0.5, levels: [] };
const level: ExamScale = { kind: 'level', low: 0, high: 0, step: 1, levels: ['below_A1', 'A1'] };

describe('an estimate on a test’s own scale', () => {
  it('says nothing without a scale or an estimate', () => {
    expect(estimateLine(null, '6.5', 'en')).toBeNull();
    expect(estimateLine(band, null, 'en')).toBeNull();
    expect(estimateLine(band, 'nine', 'en')).toBeNull();
  });

  it('shows a band and points in the learner’s number format', () => {
    expect(estimateLine(band, '6.5', 'de')).toEqual({ key: 'estimateBand', value: '6,5' });
    expect(estimateLine(points, '15.5', 'en')).toEqual({
      key: 'estimatePoints',
      value: '15.5',
      max: '25',
    });
  });

  it('shows a level, or that it is below the lowest one', () => {
    expect(estimateLine(level, 'A1', 'en')).toEqual({ key: 'estimateLevel', value: 'A1' });
    expect(estimateLine(level, 'below_A1', 'en')).toEqual({ key: 'estimateBelow', level: 'A1' });
  });
});
