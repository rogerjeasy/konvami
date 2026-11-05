import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { startActivityAsync } from 'expo-intent-launcher';
import { legalUrl } from '@/lib/legal';
import { ROUTES } from '@/lib/routes';

/**
 * Things that open outside the app: legal pages on the website and the phone's mail app.
 * All of them fail soft: if nothing can be opened, the user simply stays where they are.
 */

const LEGAL_URL = {
  terms: process.env.EXPO_PUBLIC_TERMS_URL,
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL,
} as const;

const LEGAL_SCREEN = { terms: ROUTES.legalTerms, privacy: ROUTES.legalPrivacy } as const;

/** Opens the Terms of Use or the Privacy Policy in the app language: the website's page when its
 * address is set, otherwise the app's own screen (6.18), which shows the same text. */
export function openLegal(page: keyof typeof LEGAL_URL, language: string): void {
  const url = legalUrl(LEGAL_URL[page], language);
  if (url) void Linking.openURL(url).catch(() => {});
  else router.push(LEGAL_SCREEN[page]);
}

/** Opens a file the server made for the learner (a copy of their data) in the browser or the
 * phone's viewer, from where it can be saved or shared. */
export function openFile(url: string): void {
  void Linking.openURL(url).catch(() => {});
}

/** Whether this platform has a mail app the app can bring to the front. */
/** Opens Konvami's page in the phone's settings (to allow notifications again). */
export function openAppSettings(): void {
  void Linking.openSettings().catch(() => {});
}

export const canOpenMailApp = Platform.OS === 'ios' || Platform.OS === 'android';

/** Brings the phone's mail app (its inbox, not a new message) to the front. */
export function openMailApp(): void {
  if (Platform.OS === 'ios') {
    void Linking.openURL('message://').catch(() => {});
  } else if (Platform.OS === 'android') {
    void startActivityAsync('android.intent.action.MAIN', {
      category: 'android.intent.category.APP_EMAIL',
    }).catch(() => {});
  }
}
