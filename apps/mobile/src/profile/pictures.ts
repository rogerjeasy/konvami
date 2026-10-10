import { ApiError, type PictureUpload } from '@konvami/api-client';

/**
 * The learner's photo on its way from the device to the server (profile design P2, P3). The
 * device shrinks it to a small square JPEG before anything is sent, so the full-size picture
 * and its camera data (location) never leave the phone.
 */

/** The side of the stored photo (px): sharp at the largest size the app shows it, and small. */
export const PICTURE_SIDE = 512;
/** JPEG quality of the stored photo (0–1). */
export const PICTURE_QUALITY = 0.8;

/** A photo ready to send: a square JPEG of `PICTURE_SIDE`, somewhere the device can read it. */
export interface PickedPicture {
  uri: string;
}

export type PickResult =
  | { status: 'picked'; picture: PickedPicture }
  /** The learner closed the picker without choosing. */
  | { status: 'cancelled' }
  /** The picker could not be opened or the picture could not be read. */
  | { status: 'failed' };

export type PictureSender = (upload: PictureUpload, picture: PickedPicture) => Promise<void>;

/** What a device offers for the learner's photo. Replaced in tests. */
export interface PictureDevice {
  /** Lets the learner choose a picture from their library. Never throws. */
  pick(): Promise<PickResult>;
  /** Sends a picked picture with the form the server gave. Rejects with an `ApiError`. */
  send: PictureSender;
}

/** The largest square in the middle of a picture, as the rectangle to cut out. */
export function centeredSquare(width: number, height: number) {
  const side = Math.min(width, height);
  return {
    originX: Math.floor((width - side) / 2),
    originY: Math.floor((height - side) / 2),
    width: side,
    height: side,
  };
}

/**
 * Sends a photo as a form POST straight to the file store. `filePart` turns the picture into
 * what the platform's `FormData` takes for a file (a Blob on the web, a `{ uri }` on a phone).
 */
export function createPictureSender({
  fetch: send,
  filePart,
}: {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  filePart: (picture: PickedPicture) => Promise<unknown>;
}): PictureSender {
  return async (upload, picture) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
    // The store reads the form's fields only up to the file, so the file goes last.
    form.append('file', (await filePart(picture)) as Blob);
    let response: Response;
    try {
      response = await send(upload.url, { method: 'POST', body: form });
    } catch {
      throw new ApiError('network');
    }
    if (!response.ok) throw new ApiError('upload_failed', response.status);
  };
}
