import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { de } from './locales/de';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { it } from './locales/it';
import { DEFAULT_LANGUAGE, isLanguage, SUPPORTED_LANGUAGES, type Language } from './languages';

export * from './languages';

/** The first device language the app supports, else English. */
export function deviceLanguage(): Language {
  const match = getLocales()
    .map((locale) => locale.languageCode)
    .find(isLanguage);
  return match ?? DEFAULT_LANGUAGE;
}

const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr },
    it: { translation: it },
  },
  supportedLngs: [...SUPPORTED_LANGUAGES],
  lng: deviceLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false }, // React already escapes rendered text.
  returnNull: false,
});

export default i18n;
