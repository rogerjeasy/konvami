import { useEffect } from 'react';
import type { Home } from '@konvami/api-client';
import { usePreferences } from '@/preferences';
import { DEFAULT_REMINDERS } from '@/reminders/schedule';
import { widgetBridge, type WidgetBridge } from './bridge';
import { widgetTimeline } from './snapshot';

/**
 * Keeps the home-screen widget in step with Today: its timeline is written again whenever what
 * it shows changes (streak, planned days, the partner, the learner's reminder choices). Builds
 * without the native widget hand it to nothing (`./bridge`).
 */
export function useWidgetTimeline(
  home: Home | null,
  now: Date,
  bridge: WidgetBridge = widgetBridge,
) {
  const { reminders } = usePreferences();
  const settings = reminders ?? { ...DEFAULT_REMINDERS, on: false };
  const entries = home ? widgetTimeline({ home, settings, now }) : null;
  // Written again only when what the widget shows changes, not on every render.
  const key = entries ? JSON.stringify(entries.map(({ props, date }) => [props, date])) : null;
  useEffect(() => {
    if (key === null) return;
    const read = JSON.parse(key) as [ReturnType<typeof widgetTimeline>[number]['props'], string][];
    bridge.update(read.map(([props, date]) => ({ date, props })));
  }, [bridge, key]);
}
