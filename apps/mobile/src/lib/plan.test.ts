import { missedDays, sessionRoute } from './plan';

describe('the call a planned session starts', () => {
  it('starts a review conversation around the due words', () => {
    expect(sessionRoute({ kind: 'review', minutes: 5, topic: null, scenario: null }, 'p1')).toEqual(
      { pathname: '/call/[personaId]', params: { personaId: 'p1', practise: 'words' } },
    );
  });

  it('starts a role-play that puts the week’s topic first', () => {
    expect(
      sessionRoute({ kind: 'role_play', minutes: 10, topic: 'dative', scenario: 'doctor' }, 'p1'),
    ).toEqual({
      pathname: '/call/[personaId]',
      params: { personaId: 'p1', scenario: 'doctor', practise: 'dative' },
    });
  });

  it('starts a free conversation on the week’s topic, or on nothing in particular', () => {
    expect(
      sessionRoute({ kind: 'free', minutes: 10, topic: 'perfekt', scenario: null }, 'p1'),
    ).toEqual({ pathname: '/call/[personaId]', params: { personaId: 'p1', practise: 'perfekt' } });
    expect(sessionRoute({ kind: 'free', minutes: 10, topic: null, scenario: null }, 'p1')).toEqual({
      pathname: '/call/[personaId]',
      params: { personaId: 'p1' },
    });
  });
});

describe('missed days in words', () => {
  it('names the weekdays of the dates, joined the way the language joins them', () => {
    expect(missedDays('en', ['2026-10-06', '2026-10-07'])).toBe('Tuesday and Wednesday');
    expect(missedDays('de', ['2026-10-06'])).toBe('Dienstag');
  });
});
