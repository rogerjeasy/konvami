import type { TFunction } from 'i18next';
import type { Catalog } from '@konvami/api-client';
import { isLanguage, LANGUAGE_NATIVE_NAMES } from '@/i18n/languages';

/** A language's name in itself ("Deutsch"): from the app's own languages, else the catalog. */
export function nativeLanguageName(catalog: Catalog, code: string): string {
  if (isLanguage(code)) return LANGUAGE_NATIVE_NAMES[code];
  const listed = catalog.explanationLanguages.find((language) => language.code === code);
  return listed?.name ?? code.toUpperCase();
}

/**
 * A language's name in the app language, as a label ("German"), for the languages Konvami
 * teaches. For any other language it is the name in itself, which its speakers recognise.
 */
export function languageName(catalog: Catalog, code: string, t: TFunction): string {
  return isLanguage(code) ? t(`onboarding.languages.${code}`) : nativeLanguageName(catalog, code);
}

/**
 * A taught language's name as it reads inside a sentence: "Why are you learning German?",
 * "Pourquoi veux-tu parler allemand ?" (lower case in French and Italian).
 */
export function languageInText(catalog: Catalog, code: string, t: TFunction): string {
  return isLanguage(code)
    ? t(`onboarding.languagesInText.${code}`)
    : nativeLanguageName(catalog, code);
}
