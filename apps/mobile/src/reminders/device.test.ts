import { openTargetOf } from './device';

describe('what a tapped notification opens', () => {
  it('reads it from the notification, and opens Today for anything else', () => {
    expect(openTargetOf({ card: 'card_1' })).toEqual({ open: 'card', id: 'card_1' });
    expect(openTargetOf({ open: 'report', id: 'rtc_1' })).toEqual({ open: 'report', id: 'rtc_1' });
    expect(openTargetOf({ open: 'simulation', id: 'rtc_2' })).toEqual({
      open: 'simulation',
      id: 'rtc_2',
    });
    expect(openTargetOf({ open: 'report' })).toEqual({ open: 'today' });
    expect(openTargetOf({ open: 'elsewhere', id: 'x' })).toEqual({ open: 'today' });
    expect(openTargetOf(undefined)).toEqual({ open: 'today' });
  });
});
