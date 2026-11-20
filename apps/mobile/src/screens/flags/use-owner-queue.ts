import { useCallback, useEffect, useState } from 'react';

/**
 * One game's owner queue (6.15): its items, read once (null: not the owner, or not read), and a
 * decision that takes the item off the list once the server took it. `busy` is the item being
 * decided.
 */
export function useOwnerQueue<Item extends { id: string }>(load: () => Promise<{ items: Item[] }>) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const read = useCallback(() => {
    load().then(
      ({ items: found }) => setItems(found),
      () => setItems(null),
    );
  }, [load]);
  useEffect(read, [read]);

  /** Runs a decision on `item`; `gone` says which items it takes off the list (that one). */
  const decide = useCallback(
    async (
      item: Item,
      send: () => Promise<void>,
      gone: (one: Item) => boolean = (one) => one.id === item.id,
    ) => {
      setBusy(item.id);
      try {
        await send();
        setItems((shown) => shown?.filter((one) => !gone(one)) ?? null);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  return { items, busy, decide };
}
