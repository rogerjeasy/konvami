import {
  ageBracket,
  ageOn,
  isEmail,
  isOldEnough,
  isVerificationCode,
  onlyDigits,
  passwordRules,
  passwordStrength,
} from './validation';

const on = (iso: string) => new Date(`${iso}T12:00:00`);

describe('ageOn', () => {
  it('counts full years only', () => {
    expect(ageOn({ year: 1996, month: 3, day: 14 }, on('2026-10-09'))).toBe(30);
  });

  it('does not count the year before the birthday has come', () => {
    expect(ageOn({ year: 2010, month: 10, day: 10 }, on('2026-10-09'))).toBe(15);
  });

  it('counts the year on the birthday itself', () => {
    expect(ageOn({ year: 2010, month: 10, day: 9 }, on('2026-10-09'))).toBe(16);
  });

  it('treats a 29 February birthday as 1 March in other years', () => {
    expect(ageOn({ year: 2008, month: 2, day: 29 }, on('2026-02-28'))).toBe(17);
    expect(ageOn({ year: 2008, month: 2, day: 29 }, on('2026-03-01'))).toBe(18);
  });
});

describe('isOldEnough', () => {
  it('accepts 16 and over, and rejects 15', () => {
    expect(isOldEnough({ year: 2010, month: 10, day: 9 }, on('2026-10-09'))).toBe(true);
    expect(isOldEnough({ year: 2010, month: 10, day: 10 }, on('2026-10-09'))).toBe(false);
  });

  it('rejects a birthday in the future', () => {
    expect(isOldEnough({ year: 2027, month: 1, day: 1 }, on('2026-10-09'))).toBe(false);
  });
});

describe('ageBracket', () => {
  it.each([
    [16, '16-17'],
    [17, '16-17'],
    [18, '18-24'],
    [24, '18-24'],
    [25, '25-34'],
    [44, '35-44'],
    [54, '45-54'],
    [64, '55-64'],
    [65, '65+'],
    [101, '65+'],
  ] as const)('puts %i in %s', (age, bracket) => {
    expect(ageBracket(age)).toBe(bracket);
  });
});

describe('isEmail', () => {
  it.each(['amara.diallo@mail.com', 'a@b.co', 'first+tag@sub.example.org'])('accepts %s', (s) => {
    expect(isEmail(s)).toBe(true);
  });

  it.each(['', 'amara', 'amara@', '@mail.com', 'amara@mail', 'a b@mail.com', 'a@b..com'])(
    'rejects "%s"',
    (s) => {
      expect(isEmail(s)).toBe(false);
    },
  );

  it('ignores spaces around the address', () => {
    expect(isEmail('  amara@mail.com ')).toBe(true);
  });
});

describe('passwordRules', () => {
  it('reports each rule on its own', () => {
    expect(passwordRules('')).toEqual({ length: false, number: false, symbol: false });
    expect(passwordRules('abcdefgh')).toEqual({ length: true, number: false, symbol: false });
    expect(passwordRules('abc1')).toEqual({ length: false, number: true, symbol: false });
    expect(passwordRules('abc!')).toEqual({ length: false, number: false, symbol: true });
    expect(passwordRules('Sommer2026!')).toEqual({ length: true, number: true, symbol: true });
  });

  it('does not count a space as a symbol', () => {
    expect(passwordRules('abc def').symbol).toBe(false);
  });

  it('counts every symbol the server accepts', () => {
    for (const symbol of '^$*.[]{}()?-"!@#%&/\\,><\':;|_~`+=') {
      expect([symbol, passwordRules(`abc${symbol}`).symbol]).toEqual([symbol, true]);
    }
  });

  it('does not count characters the server would refuse as a symbol', () => {
    for (const other of ['§', '€', '°', 'ß', 'é', '😀']) {
      expect([other, passwordRules(`abc${other}`).symbol]).toEqual([other, false]);
    }
  });
});

describe('passwordStrength', () => {
  it('gives one point per rule met', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abcdefgh')).toBe(1);
    expect(passwordStrength('abcdefg1')).toBe(2);
    expect(passwordStrength('Sommer26!')).toBe(3);
  });

  it('gives the fourth point only when all rules are met and it has 12 or more characters', () => {
    expect(passwordStrength('Sommer2026!x')).toBe(4);
    expect(passwordStrength('abcdefghijklmnop')).toBe(1);
  });
});

describe('verification code', () => {
  it('is exactly six digits', () => {
    expect(isVerificationCode('482915')).toBe(true);
    expect(isVerificationCode('48291')).toBe(false);
    expect(isVerificationCode('4829155')).toBe(false);
    expect(isVerificationCode('48291a')).toBe(false);
  });

  it('keeps only digits when a code is typed or pasted, up to the length', () => {
    expect(onlyDigits('482 915', 6)).toBe('482915');
    expect(onlyDigits('Code: 482915.', 6)).toBe('482915');
    expect(onlyDigits('4829157', 6)).toBe('482915');
  });
});
