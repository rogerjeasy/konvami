import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import i18n, { deviceLanguage, isLanguage, type Language } from '@/i18n';
import { readItem, removeItem, writeItem } from '@/lib/storage';

/**
 * Device preferences that apply before sign-in (today: the app language). Account-level settings
 * (the Learner Configuration Profile) live on the server, not here.
 */
export interface Preferences {
  /**
   * The app language the user picked, or `null` to follow the phone's language (the default).
   * A phone language the app doesn't offer falls back to English.
   */
  language: Language | null;
}

const KEY = { language: 'konvami.pref.language' } as const;

let current: Preferences = { language: null };
const listeners = new Set<() => void>();

/** The language the UI shows for a preference: the picked one, else the phone's. */
export function effectiveLanguage(language: Language | null): Language {
  return language ?? deviceLanguage();
}

function update(next: Preferences) {
  current = next;
  const language = effectiveLanguage(next.language);
  if (i18n.language !== language) i18n.changeLanguage(language);
  listeners.forEach((listener) => listener());
}

/** Loads saved preferences once at launch. Falls back to the defaults. */
export async function loadPreferences(): Promise<void> {
  const language = await readItem(KEY.language);
  update({ language: isLanguage(language) ? language : null });
}

/** Picks an app language, or `null` to follow the phone's language again. */
export async function setLanguage(language: Language | null): Promise<void> {
  update({ ...current, language });
  await (language ? writeItem(KEY.language, language) : removeItem(KEY.language));
}

/**
 * While the app follows the phone's language, re-reads it whenever the app comes back to the
 * foreground (Android keeps the app running when the system language changes; iOS restarts it).
 * Returns the unsubscribe function.
 */
export function followPhoneLanguage(): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active' && current.language === null) update(current);
  });
  return () => sub.remove();
}

export function getPreferences(): Preferences {
  return current;
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
