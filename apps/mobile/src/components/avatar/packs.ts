import type { ArtPack } from './art-pack';
import { GENERATED_PACKS } from './packs.generated';
import { SAMPLE_PACK } from './sample-pack';

/** The portrait drawn in code (`avatar.tsx`): the default, and the fallback of every pack. */
export const DRAWN_PACK_ID = 'konvami-drawn';

/** The art packs this build has, by id: the sample and those `pnpm avatar:packs` added. */
export const ART_PACKS: Readonly<Record<string, ArtPack>> = Object.fromEntries(
  [SAMPLE_PACK, ...GENERATED_PACKS].map((pack) => [pack.id, pack]),
);

/**
 * The pack this build draws partners with (`EXPO_PUBLIC_AVATAR_PACK`), or null for the drawn
 * portrait. An unknown id is the drawn portrait too: a typo must not leave partners faceless.
 */
export function chosenArtPack(id: string | undefined = process.env.EXPO_PUBLIC_AVATAR_PACK) {
  if (!id || id === DRAWN_PACK_ID) return null;
  return ART_PACKS[id] ?? null;
}
