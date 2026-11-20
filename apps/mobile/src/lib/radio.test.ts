import type { RadioSegment } from '@konvami/api-client';
import {
  airsWhen,
  CAPTION_MAX_MS,
  CAPTION_MIN_MS,
  captionMs,
  callIsWaiting,
  callTone,
  nextInShow,
  previousInShow,
  takesApplause,
} from './radio';
import { radioCallRoute, radioEpisodeRoute } from './routes';

function segment(index: number, changes: Partial<RadioSegment> = {}): RadioSegment {
  return {
    index,
    kind: 'call',
    speaker: 'Nova-7',
    ai: false,
    text: 'Hallo Mia',
    playable: true,
    mine: false,
    applause: { bravo: 0, ha_ha: 0, me_too: 0, wow: 0 },
    myApplause: null,
    hidden: false,
    ...changes,
  };
}

describe('the show’s playlist', () => {
  const show = [
    segment(0, { kind: 'host' }),
    segment(1, { hidden: true }),
    segment(2),
    segment(3, { kind: 'host' }),
  ];

  it('starts with the first segment and skips what the learner reported', () => {
    expect(nextInShow(show, -1)).toBe(0);
    expect(nextInShow(show, 0)).toBe(2);
    expect(nextInShow(show, 3)).toBeNull();
  });

  it('goes back past a reported segment, and stays at the start', () => {
    expect(previousInShow(show, 2)).toBe(0);
    expect(previousInShow(show, 0)).toBe(0);
  });

  it('gives applause to calls only', () => {
    expect(takesApplause(segment(0, { kind: 'host' }))).toBe(false);
    expect(takesApplause(segment(0, { kind: 'ai_call', ai: true }))).toBe(true);
    expect(takesApplause(segment(0, { hidden: true }))).toBe(false);
  });
});

describe('a caption without sound', () => {
  it('stays about as long as it takes to read, within bounds', () => {
    expect(captionMs('Hallo')).toBe(CAPTION_MIN_MS);
    expect(captionMs('eins zwei drei vier fünf sechs sieben acht neun zehn')).toBeGreaterThan(
      CAPTION_MIN_MS,
    );
    expect(captionMs('wort '.repeat(200))).toBe(CAPTION_MAX_MS);
  });
});

describe('the next show and the calls', () => {
  it('says whether the show airs today or tomorrow', () => {
    const now = new Date('2026-11-20T09:00:00');
    expect(airsWhen('2026-11-20T17:00:00', now)).toBe('today');
    expect(airsWhen('2026-11-21T17:00:00', now)).toBe('tomorrow');
  });

  it('marks a call on air, one to look at, and the rest quietly', () => {
    expect(callTone('aired')).toBe('aired');
    expect(callTone('held')).toBe('attention');
    expect(callTone('failed')).toBe('attention');
    expect(callTone('not_picked')).toBe('quiet');
    expect(callIsWaiting('checking')).toBe(true);
    expect(callIsWaiting('ready')).toBe(false);
  });

  it('opens a show and a call by id', () => {
    expect(radioEpisodeRoute('e1')).toEqual({
      pathname: '/radio/episodes/[id]',
      params: { id: 'e1' },
    });
    expect(radioCallRoute('c1')).toEqual({ pathname: '/radio/calls/[id]', params: { id: 'c1' } });
  });
});
