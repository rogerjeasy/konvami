/**
 * Sign-up rules as pure functions, so every screen and test applies the same ones. The server
 * (the Cognito password policy in infra/modules/auth) enforces the same password rules.
 */

import type { CalendarDate } from './dates';

/** Minimum age to use Konvami (spec decision D16). */
export const MINIMUM_AGE = 16;

/** Password rules shown as chips on 2.3; must match the user pool's password policy. */
export const PASSWORD_MIN_LENGTH = 8;
/** From this length, a password that meets every rule gets the top strength score. */
const PASSWORD_LONG_LENGTH = 12;

/** Digits in the email verification code Cognito sends. */
export const CODE_LENGTH = 6;

/** A birthday, as picked on the date wheels. */
export type BirthDate = CalendarDate;

export type AgeBracket = '16-17' | '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+';

/** Lower bound of each bracket, oldest first. */
const BRACKETS: readonly [number, AgeBracket][] = [
  [65, '65+'],
  [55, '55-64'],
  [45, '45-54'],
  [35, '35-44'],
  [25, '25-34'],
  [18, '18-24'],
  [MINIMUM_AGE, '16-17'],
];

/** Full years between `birth` and `today`, in the device's time zone. */
export function ageOn(birth: BirthDate, today: Date): number {
  const years = today.getFullYear() - birth.year;
  const month = today.getMonth() + 1;
  const hadBirthday =
    month > birth.month || (month === birth.month && today.getDate() >= birth.day);
  return hadBirthday ? years : years - 1;
}

export function isOldEnough(birth: BirthDate, today: Date): boolean {
  return ageOn(birth, today) >= MINIMUM_AGE;
}

/** The coarse age group stored on the account; the birthday itself never leaves the device. */
export function ageBracket(age: number): AgeBracket {
  const match = BRACKETS.find(([from]) => age >= from);
  return match ? match[1] : '16-17';
}

// One @, no spaces, a dot in the domain, no empty label. Deliverability is proven by the code email.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

// The special characters Cognito's password policy counts as a symbol. A wider rule here would
// show the chip as met for a password the server then refuses.
const SYMBOL = /[\^$*.[\]{}()?\-"!@#%&/\\,><':;|_~`+=]/;

export interface PasswordRules {
  length: boolean;
  number: boolean;
  symbol: boolean;
}

export function passwordRules(password: string): PasswordRules {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    number: /\d/.test(password),
    symbol: SYMBOL.test(password),
  };
}

export function isValidPassword(password: string): boolean {
  const rules = passwordRules(password);
  return rules.length && rules.number && rules.symbol;
}

/** 0–4: one point per rule met, plus one when all are met and the password is long. */
export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export function passwordStrength(password: string): PasswordStrength {
  const rules = passwordRules(password);
  const met = [rules.length, rules.number, rules.symbol].filter(Boolean).length;
  const bonus = met === 3 && password.length >= PASSWORD_LONG_LENGTH ? 1 : 0;
  return (met + bonus) as PasswordStrength;
}

/** Keeps the digits of typed or pasted text, at most `max` of them. */
export function onlyDigits(value: string, max: number): string {
  return value.replace(/\D/g, '').slice(0, max);
}

export function isVerificationCode(value: string): boolean {
  return value.length === CODE_LENGTH && /^\d+$/.test(value);
}
