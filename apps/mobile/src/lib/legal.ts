import { DEFAULT_LANGUAGE, isLanguage } from '@/i18n/languages';

/** Where a legal page is, from its configured address (EXPO_PUBLIC_*_URL) and the app language.
 * The site has one page per UI language, so `{lang}` in the address becomes the app language;
 * undefined while no address is configured. */
export function legalUrl(template: string | undefined, language: string): string | undefined {
  const url = template?.trim();
  if (!url) return undefined;
  return url.replaceAll('{lang}', isLanguage(language) ? language : DEFAULT_LANGUAGE);
}
