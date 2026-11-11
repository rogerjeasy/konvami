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
// Camera access is requested only when the learner captures material for an import.
const CAMERA_REASON = 'Konvami uses the camera when you choose to photograph material to practise.';

// iOS privacy manifest (PrivacyInfo.xcprivacy), merged by Expo with those of the libraries.
// Keep the data types in step with docs/store/privacy-labels.md, which says where each comes from.
const COLLECTED_FOR_THE_APP = {
  NSPrivacyCollectedDataTypeLinked: true,
  NSPrivacyCollectedDataTypeTracking: false,
  NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
};
const PRIVACY_MANIFEST = {
  // Konvami has no advertising, no cross-app tracking and no analytics SDK.
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
  NSPrivacyCollectedDataTypes: [
    'NSPrivacyCollectedDataTypeEmailAddress',
    'NSPrivacyCollectedDataTypeName',
    'NSPrivacyCollectedDataTypeUserID',
    'NSPrivacyCollectedDataTypeDeviceID',
    'NSPrivacyCollectedDataTypePhotosorVideos',
    'NSPrivacyCollectedDataTypeAudioData',
    'NSPrivacyCollectedDataTypeOtherUserContent',
    'NSPrivacyCollectedDataTypeProductInteraction',
    // Age group, consent choices and the learning profile (level, goals, interests).
    'NSPrivacyCollectedDataTypeOtherDataTypes',
  ].map((NSPrivacyCollectedDataType) => ({ NSPrivacyCollectedDataType, ...COLLECTED_FOR_THE_APP })),
  // The required-reason APIs that React Native, Expo and the app's libraries use, with the reasons
  // Expo documents for them (preferences, file times, boot time, free disk space).
  NSPrivacyAccessedAPITypes: [
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
      NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
    },
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
      NSPrivacyAccessedAPITypeReasons: ['C617.1', '0A2A.1', '3B52.1'],
    },
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
      NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
    },
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
      NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
    },
  ],
};

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
    privacyManifests: PRIVACY_MANIFEST,
  },
  android: {
    package: BUNDLE_ID,
    // Push from the server on Android goes through Firebase: the app's Firebase config, given to
    // EAS builds as a file variable (never committed). Without it the app has no push address.
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
    adaptiveIcon: {
      backgroundColor: brand.tile,
      foregroundImage: './assets/brand/android-icon-foreground.png',
      backgroundImage: './assets/brand/android-icon-background.png',
      monochromeImage: './assets/brand/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // The WebRTC plugin below declares every permission the library can use. Konvami sends
    // voice only for calls; course imports can use the camera. No overlays are needed.
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      // The profile photo is chosen with the system photo picker, which needs no storage access;
      // Google Play asks for a justification for every photo or storage permission.
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/brand/favicon.png',
  },
  plugins: [
    'expo-sharing',
    // Local assessment decoding and the opt-in screen-off conversation service.
    [
      'react-native-audio-api',
      {
        iosBackgroundMode: true,
        androidForegroundService: true,
        androidFSStopWithTask: true,
        androidFSTypes: ['microphone', 'mediaPlayback'],
        androidPermissions: [
          'android.permission.FOREGROUND_SERVICE',
          'android.permission.FOREGROUND_SERVICE_MICROPHONE',
          'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
          'android.permission.POST_NOTIFICATIONS',
        ],
      },
    ],
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
    // Crash reporting (spec §6.21.4). Only in a build that has a DSN; without one the app never
    // loads Sentry. Source maps are not uploaded yet (docs/superpowers/specs/2026-11-06-ops-feedback-design.md).
    ...(process.env.EXPO_PUBLIC_SENTRY_DSN ? ['@sentry/react-native/expo' as const] : []),
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
        microphonePermission: MICROPHONE_REASON,
        // Konvami plays and records only while it is open (background audio belongs to the
        // hands-free mode, spec §6.3, which is not built). The default would add iOS's "audio"
        // background mode and Android's media foreground-service permissions, which the stores
        // review and which nothing here uses.
        enableBackgroundPlayback: false,
      },
    ],
    [
      // Live voice calls (spec §10.2). A native module: voice works in development and store
      // builds, not in Expo Go, where the voice screen offers the form instead.
      '@config-plugins/react-native-webrtc',
      { microphonePermission: MICROPHONE_REASON, cameraPermission: CAMERA_REASON },
    ],
    [
      // The learner's photo (6.2 Personal), chosen with the system's photo picker. A native
      // module: after adding it, development builds must be rebuilt.
      'expo-image-picker',
      {
        photosPermission: 'Konvami opens your photos so you can choose a profile photo.',
        // The import screen can capture a page; profile photos still use the library.
        // (Passing `false` for the microphone would block it for voice calls as well.)
        cameraPermission: CAMERA_REASON,
        microphonePermission: MICROPHONE_REASON,
      },
    ],
    [
      // Practice reminders (spec §6.18), scheduled on the device: no push server. A native
      // module: after adding it, development builds must be rebuilt.
      'expo-notifications',
      { icon: './assets/brand/notification-icon.png', color: brand.tile },
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
