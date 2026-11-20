/** How many partners a conversation can have at once (5.24). */
export const PARTNERS_TOGETHER = 2;

/**
 * The partners picked after tapping `id`, in the order they were picked (the first leads): a
 * picked one is unpicked; a new one is added, and replaces the second when two are picked already.
 */
export function pick(picked: readonly string[], id: string): readonly string[] {
  if (picked.includes(id)) return picked.filter((other) => other !== id);
  if (picked.length < PARTNERS_TOGETHER) return [...picked, id];
  return [...picked.slice(0, PARTNERS_TOGETHER - 1), id];
}
