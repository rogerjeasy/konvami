import type { ExpoConfig } from 'expo/config';
import { brand, color } from '@konvami/design-tokens';
import { SUPPORTED_LANGUAGES } from './src/i18n/languages.ts';

/**
 * Expo app config. Brand colors come from @konvami/design-tokens; nothing here is a secret.
 * Per-environment values (API URLs, auth client ids) come from EXPO_PUBLIC_* variables in a local,
 * gitignored .env (see .env.example), never from this file.
 */
const STORE_BUNDLE_ID = 'app.konvami';

/**
 * A development build (`pnpm device:ios`, which sets APP_VARIANT) is its own app: another id and
 * name, so it installs next to the store app, and so signing it with a personal Apple ID never
 * registers the store's bundle id to that person's team.
 */
const IS_DEV_BUILD = process.env.APP_VARIANT === 'development';
const BUNDLE_ID = IS_DEV_BUILD ? `${STORE_BUNDLE_ID}.dev` : STORE_BUNDLE_ID;

// Shown by iOS in the microphone prompt (after screen 2.6 explains it in the app language).
// Every plugin that touches the microphone gets the same sentence: iOS shows one prompt.
const MICROPHONE_REASON =
  'Konvami uses the microphone during a practice session so your conversation partner can hear you and reply. It is never on in the background.';
// Required by plugins that could use the camera; Konvami never requests it (see
// blockedPermissions below).
const NO_CAMERA = 'Konvami does not use the camera.';

const config: ExpoConfig = {
  name: IS_DEV_BUILD ? 'Konvami Dev' : 'Konvami',
  slug: 'konvami',
  // The Expo account and EAS project that build and distribute the app (`eas build`).
  owner: 'rogerjeasy',
  scheme: 'konvami',
  version: '0.1.0',
  orientation: 'default',
  icon: './assets/brand/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: color.light.bg,
  ios: {
    bundleIdentifier: BUNDLE_ID,
    // Who signs a build made on this machine (`pnpm device:ios`): the developer's own Apple team,
    // from the local .env. Store builds are signed by EAS and do not read it.
    appleTeamId: process.env.APPLE_TEAM_ID || undefined,
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
    // The WebRTC plugin below declares every permission the library can use. Konvami sends
    // voice only: it never opens the camera and never draws over other apps.
    blockedPermissions: ['android.permission.CAMERA', 'android.permission.SYSTEM_ALERT_WINDOW'],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/brand/favicon.png',
  },
  plugins: [
    'expo-router',
    // The developer menu and launcher of a development build; left out of store builds by Expo.
    'expo-dev-client',
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
    ['expo-audio', { microphonePermission: MICROPHONE_REASON }],
    [
      // Live voice calls (spec §10.2). A native module: voice works in development and store
      // builds, not in Expo Go, where the voice screen offers the form instead.
      '@config-plugins/react-native-webrtc',
      { microphonePermission: MICROPHONE_REASON, cameraPermission: NO_CAMERA },
    ],
    [
      // The learner's photo (6.2 Personal), chosen with the system's photo picker. A native
      // module: after adding it, development builds must be rebuilt.
      'expo-image-picker',
      {
        photosPermission: 'Konvami opens your photos so you can choose a profile photo.',
        // The picker could also take photos and videos; Konvami only ever opens the library.
        // (Passing `false` for the microphone would block it for voice calls as well.)
        cameraPermission: NO_CAMERA,
        microphonePermission: MICROPHONE_REASON,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: { projectId: '5aec2d72-6925-41c1-b60f-c3e34529fe7d' },
  },
};

export default config;
