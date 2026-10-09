import {
  afterFailedSignIn,
  MAX_SIGN_IN_TRIES,
  NO_ATTEMPTS,
  parseAttempts,
  pauseRemainingMs,
  SIGN_IN_PAUSE_MINUTES,
  triesLeft,
} from './attempts';

const NOW = 1_800_000_000_000;
const PAUSE_MS = SIGN_IN_PAUSE_MINUTES * 60 * 1000;

function failTimes(times: number, at = NOW) {
  let attempts = NO_ATTEMPTS;
  for (let i = 0; i < times; i++) attempts = afterFailedSignIn(attempts, at);
  return attempts;
}

describe('sign-in attempts', () => {
  it('starts with every try available and no pause', () => {
    expect(triesLeft(NO_ATTEMPTS)).toBe(MAX_SIGN_IN_TRIES);
    expect(pauseRemainingMs(NO_ATTEMPTS, NOW)).toBe(0);
  });

  it('takes one try away for each failed sign-in', () => {
    expect(triesLeft(failTimes(1))).toBe(MAX_SIGN_IN_TRIES - 1);
    expect(triesLeft(failTimes(3))).toBe(MAX_SIGN_IN_TRIES - 3);
    expect(pauseRemainingMs(failTimes(MAX_SIGN_IN_TRIES - 1), NOW)).toBe(0);
  });

  it('pauses sign-in for five minutes after the last try is used', () => {
    const attempts = failTimes(MAX_SIGN_IN_TRIES);
    expect(pauseRemainingMs(attempts, NOW)).toBe(PAUSE_MS);
    expect(pauseRemainingMs(attempts, NOW + PAUSE_MS - 1000)).toBe(1000);
  });

  it('gives every try back once the pause is over', () => {
    const attempts = failTimes(MAX_SIGN_IN_TRIES);
    expect(pauseRemainingMs(attempts, NOW + PAUSE_MS)).toBe(0);
    expect(triesLeft(afterFailedSignIn(attempts, NOW + PAUSE_MS))).toBe(MAX_SIGN_IN_TRIES - 1);
  });

  it('survives being saved and read back', () => {
    const attempts = failTimes(MAX_SIGN_IN_TRIES);
    expect(parseAttempts(JSON.stringify(attempts))).toEqual(attempts);
  });

  it.each([null, '', 'not json', '{"failures":"x"}', '{"failures":-2,"pausedUntil":null}', '[]'])(
    'treats saved data it cannot read (%p) as no attempts',
    (stored) => {
      expect(parseAttempts(stored)).toEqual(NO_ATTEMPTS);
    },
  );
});
