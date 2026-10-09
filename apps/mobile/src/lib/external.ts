import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { startActivityAsync } from 'expo-intent-launcher';
import { ROUTES } from '@/lib/routes';

/**
 * Things that open outside the app: legal pages on the website and the phone's mail app.
 * All of them fail soft: if nothing can be opened, the user simply stays where they are.
 */

const LEGAL_URL = {
  terms: process.env.EXPO_PUBLIC_TERMS_URL,
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL,
} as const;

/** Opens the Terms of Use or the Privacy Policy; the in-app placeholder until the pages exist. */
export function openLegal(page: keyof typeof LEGAL_URL): void {
  const url = LEGAL_URL[page]?.trim();
  if (url) void Linking.openURL(url).catch(() => {});
  else router.push(ROUTES.comingNext);
}

/** Whether this platform has a mail app the app can bring to the front. */
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
