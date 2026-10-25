import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import i18n, { deviceLanguage, isLanguage, type Language } from '@/i18n';
import { readItem, removeItem, writeItem } from '@/lib/storage';

/**
 * Device preferences: the app language, which applies before sign-in, and how a conversation
 * looks on this device. Account-level settings (the Learner Configuration Profile) live on the
 * server, not here.
 */
export interface Preferences {
  /**
   * The app language the user picked, or `null` to follow the phone's language (the default).
   * A phone language the app doesn't offer falls back to English.
   */
  language: Language | null;
  /**
   * Whether a conversation shows what the partner says as text. Hidden, the learner listens
   * only (spec §6.4 captions). Shown by default.
   */
  partnerCaptions: boolean;
  /**
   * Whether a conversation shows the mistakes the server finds in the learner's turns as they
   * speak (spec §6.4 correction chips). Shown by default; hidden, they wait for the report.
   */
  liveCorrections: boolean;
}

const KEY = {
  language: 'konvami.pref.language',
  partnerCaptions: 'konvami.pref.partnerCaptions',
  liveCorrections: 'konvami.pref.liveCorrections',
} as const;
// What a shown-by-default preference is stored as when the learner hid it.
const HIDDEN = 'hidden';

let current: Preferences = { language: null, partnerCaptions: true, liveCorrections: true };
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
  const [language, captions, corrections] = await Promise.all([
    readItem(KEY.language),
    readItem(KEY.partnerCaptions),
    readItem(KEY.liveCorrections),
  ]);
  update({
    language: isLanguage(language) ? language : null,
    partnerCaptions: captions !== HIDDEN,
    liveCorrections: corrections !== HIDDEN,
  });
}

/** Picks an app language, or `null` to follow the phone's language again. */
export async function setLanguage(language: Language | null): Promise<void> {
  update({ ...current, language });
  await (language ? writeItem(KEY.language, language) : removeItem(KEY.language));
}

/** Shows or hides what the partner says during a conversation. */
export async function setPartnerCaptions(shown: boolean): Promise<void> {
  update({ ...current, partnerCaptions: shown });
  await (shown ? removeItem(KEY.partnerCaptions) : writeItem(KEY.partnerCaptions, HIDDEN));
}

/** Shows or hides the mistakes found while the learner speaks. */
export async function setLiveCorrections(shown: boolean): Promise<void> {
  update({ ...current, liveCorrections: shown });
  await (shown ? removeItem(KEY.liveCorrections) : writeItem(KEY.liveCorrections, HIDDEN));
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
