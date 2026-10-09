/** UI languages at launch (spec D15). Order is the order shown in the language picker. */
export const SUPPORTED_LANGUAGES = ['en', 'de', 'fr', 'it'] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en';

/** Each language's name in itself, so people can find their own language whatever is active. */
export const LANGUAGE_NATIVE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
};

export function isLanguage(value: unknown): value is Language {
  return SUPPORTED_LANGUAGES.includes(value as Language);
}
