import type { Home } from '@konvami/api-client';
import { DEFAULT_REMINDERS } from '@/reminders/schedule';
import { createFakeApi } from '@/test/fake-api';
import { talkNowUrl, widgetTimeline } from './snapshot';

// Friday 9 October 2026 at 9:00 on the device's clock.
const NOW = new Date(2026, 9, 9, 9, 0);

async function home(): Promise<Home> {
  const api = createFakeApi();
  api.enterApp();
  api.talked(0, { daysAgo: 1 });
  return api.getHome('Europe/Zurich');
}

describe('the home-screen widget', () => {
  it('shows the streak, the next planned practice and a way to talk now', async () => {
    const today = await home();
    const partner = today.partners[0]!.persona;

    const [now] = widgetTimeline({ home: today, settings: DEFAULT_REMINDERS, now: NOW });

    expect(now).toEqual({
      date: NOW.toISOString(),
      props: {
        streakDays: today.activity.streakDays,
        practisedToday: today.activity.practisedToday,
        next: { at: new Date(2026, 9, 9, 18, 0).toISOString(), partner: partner.name, ring: false },
        partner: partner.name,
        url: `konvami://call/${partner.id}`,
      },
    });
  });

  it('moves on to the next planned time once one has passed', async () => {
    const timeline = widgetTimeline({ home: await home(), settings: DEFAULT_REMINDERS, now: NOW });

    expect(timeline.length).toBeGreaterThan(1);
    const [, afterToday] = timeline;
    expect(afterToday?.date).toBe(new Date(2026, 9, 9, 18, 0).toISOString());
    expect(afterToday?.props.next?.at).not.toBe(afterToday?.date);
    expect(afterToday?.props.practisedToday).toBe(false);
  });

  it('says the partner will ring when partner calls are on', async () => {
    const [now] = widgetTimeline({
      home: await home(),
      settings: { ...DEFAULT_REMINDERS, calls: true },
      now: NOW,
    });

    expect(now?.props.next?.ring).toBe(true);
  });

  it('still shows the planned days with reminders off, without a ring', async () => {
    const [now] = widgetTimeline({
      home: await home(),
      settings: { ...DEFAULT_REMINDERS, on: false, calls: true },
      now: NOW,
    });

    expect(now?.props.next).toMatchObject({ ring: false });
  });

  it('opens Today when there is no partner to call', () => {
    expect(talkNowUrl(null)).toBe('konvami://today');
    expect(talkNowUrl('p 1')).toBe('konvami://call/p%201');
  });
});
