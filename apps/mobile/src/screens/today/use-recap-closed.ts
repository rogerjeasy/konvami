import { useCallback, useEffect, useState } from 'react';
import { readItem, writeItem } from '@/lib/storage';

// The Monday of the last recap the learner closed, kept on this device only.
const KEY = 'konvami.motivation.recapClosed';

/**
 * Whether the recap of the week from `week` (its Monday) was closed on this device, and how to
 * close it. Unknown (`null`) until storage answers, so the card never flashes open and shut.
 */
export function useRecapClosed(week: string | null): {
  closed: boolean | null;
  close: () => void;
} {
  const [closedWeek, setClosedWeek] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void readItem(KEY)
      .catch(() => null)
      .then((stored) => {
        if (live) setClosedWeek(stored);
      });
    return () => {
      live = false;
    };
  }, []);
  const close = useCallback(() => {
    if (!week) return;
    setClosedWeek(week);
    void writeItem(KEY, week).catch(() => {});
  }, [week]);
  return { closed: closedWeek === undefined ? null : closedWeek === week, close };
}
