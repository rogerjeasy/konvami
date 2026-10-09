import type { ExpoConfig } from 'expo/config';
import { brand, color } from '@konvami/design-tokens';
import { SUPPORTED_LANGUAGES } from './src/i18n/languages.ts';

/**
 * Expo app config. Brand colors come from @konvami/design-tokens; nothing here is a secret.
 * Per-environment values (API URLs, auth client ids) come from EXPO_PUBLIC_* variables in a local,
 * gitignored .env (see .env.example), never from this file.
 */
const BUNDLE_ID = 'app.konvami';

const config: ExpoConfig = {
  name: 'Konvami',
  slug: 'konvami',
  scheme: 'konvami',
  version: '0.1.0',
  orientation: 'default',
  icon: './assets/brand/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: color.light.bg,
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: brand.tile,
      foregroundImage: './assets/brand/android-icon-foreground.png',
      backgroundImage: './assets/brand/android-icon-background.png',
      monochromeImage: './assets/brand/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/brand/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/brand/splash-icon.png',
        imageWidth: 120,
        resizeMode: 'contain',
        backgroundColor: color.light.splash,
        dark: { image: './assets/brand/splash-icon.png', backgroundColor: color.dark.splash },
      },
    ],
    'expo-font',
    [
      'expo-localization',
      {
        supportedLocales: { ios: [...SUPPORTED_LANGUAGES], android: [...SUPPORTED_LANGUAGES] },
      },
    ],
    'expo-secure-store',
    [
      'expo-local-authentication',
      {
        // Shown by iOS the first time Face ID is used (screen 3.3 Welcome back).
        faceIDPermission:
          'Konvami uses Face ID so you can get back into your account without typing your password.',
      },
    ],
    [
      'expo-audio',
      {
        // Shown by iOS in the microphone prompt (after screen 2.6 explains it in the app language).
        microphonePermission:
          'Konvami uses the microphone during a practice session so your conversation partner can hear you and reply. It is never on in the background.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
