/**
 * The home-screen and lock-screen widget (design note 2026-11-20-partner-calls, "Widgets"): the
 * streak, the next planned practice and "Talk now". Off by default: the widget is a native target
 * (a widget extension on iOS, an app widget on Android) that only a device build can check, so a
 * build adds it only with `KONVAMI_WIDGETS=1`, after `npx expo install expo-widgets`. Without the
 * variable this plugin changes nothing, and the app's widget bridge (`src/widgets/bridge.ts`)
 * hands the timeline to nothing.
 */

// The widget as the system lists it. Its drawing and its data come from the app's JavaScript
// (`src/widgets`); `KonvamiToday` is the name both sides use.
const WIDGET = {
  name: 'KonvamiToday',
  displayName: 'Konvami',
  description: 'Your streak, your next practice and Talk now.',
  supportedFamilies: ['systemSmall', 'systemMedium', 'accessoryRectangular', 'accessoryCircular'],
  contentMarginsDisabled: false,
  // About two by two cells on Android's home screen; it can be resized.
  android: { targetCellWidth: 2, targetCellHeight: 2, resizeMode: 'both' },
};

/** @param {import('expo/config').ExpoConfig} config */
module.exports = function withKonvamiWidgets(config) {
  if (process.env.KONVAMI_WIDGETS !== '1') return config;
  let withWidgets;
  try {
    withWidgets = require('expo-widgets/app.plugin');
  } catch {
    throw new Error(
      'KONVAMI_WIDGETS=1 needs expo-widgets: run `npx expo install expo-widgets` in apps/mobile ' +
        '(docs/superpowers/specs/2026-11-20-partner-calls-design.md).',
    );
  }
  const bundleIdentifier = config.ios?.bundleIdentifier;
  return withWidgets(config, {
    // The app and the widget share the widget's timeline through this App Group.
    ...(bundleIdentifier ? { groupIdentifier: `group.${bundleIdentifier}` } : {}),
    enableAndroid: true,
    widgets: [WIDGET],
  });
};
