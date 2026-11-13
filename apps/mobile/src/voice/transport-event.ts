import { LIVE_CORRECTION_NOTE } from './conversation';
import { PREMIUM_AUDIO_NOTE } from './premium-playback';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Provider IDs belong to one peer; display state survives several peers of a logical call. */
export function transportEvent(event: unknown, generation: number): unknown {
  if (!generation || !record(event)) return event;
  const id = (value: unknown) =>
    typeof value === 'string' && value ? `transport_${generation}_${value}` : value;
  const identities = (value: Record<string, unknown>) => {
    const mapped = { ...value };
    for (const key of ['id', 'item_id', 'call_id']) {
      if (key in mapped) mapped[key] = id(mapped[key]);
    }
    return mapped;
  };
  const mapped = identities(event);
  if (!record(event.item)) return mapped;
  const item = identities(event.item);
  if (item.role === 'system' && Array.isArray(item.content)) {
    item.content = item.content.map((part: unknown) => {
      if (!record(part) || typeof part.text !== 'string') return part;
      for (const [prefix, key] of [
        [LIVE_CORRECTION_NOTE, 'turn'],
        [PREMIUM_AUDIO_NOTE, 'id'],
      ] as const) {
        if (!part.text.startsWith(prefix)) continue;
        try {
          const payload: unknown = JSON.parse(part.text.slice(prefix.length));
          if (record(payload) && typeof payload[key] === 'string')
            return {
              ...part,
              text: prefix + JSON.stringify({ ...payload, [key]: id(payload[key]) }),
            };
        } catch {
          // Malformed receipts remain ignored by their existing consumers.
        }
      }
      return part;
    });
  }
  return { ...mapped, item };
}
