import type { Memory } from '@konvami/api-client';

/**
 * A part of the "What my partners know" list: what is on a day (`dates`), what is true of the
 * learner's life (`about`), or what belongs to them and one partner (`partner`).
 */
export interface MemoryGroup {
  key: string;
  kind: 'dates' | 'about' | 'partner';
  /** The partner of a `partner` group; null when they are no longer among the partners. */
  partnerName: string | null;
  memories: Memory[];
}

/**
 * Whether `a` belongs before `b` among the dated memories: what is today or still to come
 * first, the soonest on top; then what is past, the latest on top; what has no day last.
 * Days are calendar dates ("2026-10-16"), which sort as text.
 */
function byDay(today: string) {
  const rank = (day: string | null) => (day === null ? 2 : day >= today ? 0 : 1);
  return (a: Memory, b: Memory) => {
    const [first, second] = [rank(a.day), rank(b.day)];
    if (first !== second) return first - second;
    if (a.day === null || b.day === null || a.day === b.day) return 0;
    const sooner = a.day < b.day ? -1 : 1;
    return first === 0 ? sooner : -sooner;
  };
}

/**
 * The memories as the screen lists them, in groups, without the empty ones. Within a group
 * they keep the order they came in (newest first), except the dated ones. `today` is the
 * device's calendar date.
 */
export function groupMemories(memories: readonly Memory[], today: string): MemoryGroup[] {
  const dates = memories.filter((memory) => memory.kind === 'event').sort(byDay(today));
  const about = memories.filter(({ kind }) => kind === 'fact' || kind === 'preference');
  const partners = new Map<string, MemoryGroup>();
  for (const memory of memories) {
    if (memory.kind !== 'relationship') continue;
    // One without a partner cannot come from the server; it is listed rather than dropped.
    const id = memory.partnerId ?? '';
    const group = partners.get(id) ?? {
      key: `partner:${id}`,
      kind: 'partner',
      partnerName: memory.partnerName,
      memories: [],
    };
    group.memories.push(memory);
    partners.set(id, group);
  }
  const groups: MemoryGroup[] = [
    { key: 'dates', kind: 'dates', partnerName: null, memories: dates },
    { key: 'about', kind: 'about', partnerName: null, memories: about },
    ...partners.values(),
  ];
  return groups.filter((group) => group.memories.length > 0);
}
