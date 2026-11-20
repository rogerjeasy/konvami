import { openTargetOf } from './device';

describe('what a tapped notification opens', () => {
  it('reads it from the notification, and opens Today for anything else', () => {
    expect(openTargetOf({ card: 'card_1' })).toEqual({ open: 'card', id: 'card_1' });
    expect(openTargetOf({ open: 'report', id: 'rtc_1' })).toEqual({ open: 'report', id: 'rtc_1' });
    expect(openTargetOf({ open: 'halves', id: 'case_1' })).toEqual({
      open: 'halves',
      id: 'case_1',
    });
    expect(openTargetOf({ open: 'simulation', id: 'rtc_2' })).toEqual({
      open: 'simulation',
      id: 'rtc_2',
    });
    expect(openTargetOf({ open: 'report' })).toEqual({ open: 'today' });
    expect(openTargetOf({ open: 'elsewhere', id: 'x' })).toEqual({ open: 'today' });
    expect(openTargetOf(undefined)).toEqual({ open: 'today' });
  });

  it('opens a partner’s ring with who rings and their question', () => {
    expect(openTargetOf({ open: 'call', partner: 'p_1' })).toEqual({ open: 'call', partner: 'p_1' });
    expect(openTargetOf({ open: 'call', partner: 'p_1', ask: 'Und, das Interview?' })).toEqual({
      open: 'call',
      partner: 'p_1',
      ask: 'Und, das Interview?',
    });
    expect(openTargetOf({ open: 'call' })).toEqual({ open: 'today' });
  });
});
