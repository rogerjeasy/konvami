import type { PickResult, PictureSender } from '@/profile/pictures';

/**
 * A photo to read for the course companion (spec §6.17): a menu, a letter, an article or a page
 * of a textbook. The device shrinks it to a JPEG before anything is sent, so the full-size
 * picture and its camera data (location) never leave the phone, and the server deletes it as soon
 * as it has been read.
 */

/** The longest side of the photo that is sent (px): enough to read small print, and under 1 MB. */
export const IMPORT_PHOTO_SIDE = 1600;
/** JPEG quality of the photo that is sent (0–1). */
export const IMPORT_PHOTO_QUALITY = 0.8;

/** What a device offers for the photo of an import. Replaced in tests. */
export interface ImportPhotos {
  /** Lets the learner choose a picture from their library and shrinks it. Never throws. */
  pick(source?: 'library' | 'camera'): Promise<PickResult>;
  /** Sends a picked photo with the form the server gave. Rejects with an `ApiError`. */
  send: PictureSender;
}

/**
 * How to shrink a picture of the given size so its longest side is `IMPORT_PHOTO_SIDE`: the new
 * width or height (the other follows from the proportions); null when it is small enough.
 */
export function shrinkTo(
  width: number,
  height: number,
): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= IMPORT_PHOTO_SIDE) return null;
  return width >= height ? { width: IMPORT_PHOTO_SIDE } : { height: IMPORT_PHOTO_SIDE };
}
