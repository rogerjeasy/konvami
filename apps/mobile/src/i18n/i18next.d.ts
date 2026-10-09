import 'i18next';
import type { en } from './locales/en';

// Typed translation keys: t('welcome.title') is checked at compile time.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
