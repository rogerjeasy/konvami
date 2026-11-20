import type { WidgetEntry } from './snapshot';

/**
 * Hands the widget's timeline to the system widget. Builds without the native widget (the
 * default: `KONVAMI_WIDGETS` unset, see `plugins/with-konvami-widgets.js`) have nothing to hand
 * it to, so this does nothing.
 *
 * To turn the widget on (design note 2026-11-20-partner-calls, "Widgets"): install `expo-widgets`
 * with `npx expo install expo-widgets`, build with `KONVAMI_WIDGETS=1`, and replace this file's
 * body with the `Widget` of `expo-widgets`:
 *
 *   const widget = new Widget<WidgetProps>('KonvamiToday', KonvamiTodayLayout);
 *   export const widgetBridge = { update: (entries) => widget.updateTimeline(
 *     entries.map(({ date, props }) => ({ date: new Date(date), props }))) };
 *
 * where `KonvamiTodayLayout` draws the props with `@expo/ui` (the design note has it).
 */
export interface WidgetBridge {
  update(entries: readonly WidgetEntry[]): void;
}

export const widgetBridge: WidgetBridge = {
  update() {},
};
