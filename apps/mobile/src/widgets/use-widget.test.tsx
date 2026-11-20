import { act, renderHook } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { setReminders } from '@/preferences';
import { DEFAULT_REMINDERS } from '@/reminders/schedule';
import { createFakeApi } from '@/test/fake-api';
import type { WidgetBridge } from './bridge';
import type { WidgetEntry } from './snapshot';
import { useWidgetTimeline } from './use-widget';

// Friday 9 October 2026 at 9:00 on the device's clock.
const NOW = new Date(2026, 9, 9, 9, 0);

beforeEach(async () => {
  (SecureStore as unknown as { __reset: () => void }).__reset();
  await setReminders(null);
});

function recorder() {
  const written: WidgetEntry[][] = [];
  const bridge: WidgetBridge = { update: (entries) => void written.push([...entries]) };
  return { bridge, written };
}

describe('the widget, kept in step with Today', () => {
  it('is written once Today is read, and again only when what it shows changes', async () => {
    const api = createFakeApi();
    api.enterApp();
    const home = await api.getHome('Europe/Zurich');
    const { bridge, written } = recorder();

    const { rerender } = await renderHook(
      ({ now }: { now: Date }) => useWidgetTimeline(home, now, bridge),
      { initialProps: { now: NOW } },
    );
    expect(written).toHaveLength(1);
    expect(written[0]?.[0]?.props.next?.ring).toBe(false);

    await rerender({ now: NOW });
    expect(written).toHaveLength(1);

    await act(() => setReminders({ ...DEFAULT_REMINDERS, calls: true }));
    expect(written).toHaveLength(2);
    expect(written[1]?.[0]?.props.next?.ring).toBe(true);
  });

  it('writes nothing before Today is read', async () => {
    const { bridge, written } = recorder();
    await renderHook(() => useWidgetTimeline(null, NOW, bridge));
    expect(written).toEqual([]);
  });
});
