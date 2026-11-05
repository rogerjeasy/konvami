import { ApiError, type PictureUpload } from '@konvami/api-client';
import type { ImportPhotos } from '@/imports/photos';
import type { PickedPicture, PickResult } from '@/profile/pictures';

/** What the learner does in the photo picker: choose a photo, close it, or fail to read one. */
export interface FakeImportPhotos extends ImportPhotos {
  /** What the picker gives next (by default a photo). */
  picks(result: PickResult): void;
  /** Makes sending fail once, as a network error would. */
  failNextSend(): void;
  /** The photos sent so far, with the form each went with. */
  readonly sent: { upload: PictureUpload; picture: PickedPicture }[];
}

export function createFakeImportPhotos(): FakeImportPhotos {
  let next: PickResult = { status: 'picked', picture: { uri: 'file:///page.jpg' } };
  let failing = false;
  const sent: FakeImportPhotos['sent'] = [];
  return {
    picks: (result) => {
      next = result;
    },
    failNextSend: () => {
      failing = true;
    },
    sent,
    async pick() {
      return next;
    },
    async send(upload, picture) {
      if (failing) {
        failing = false;
        throw new ApiError('network');
      }
      sent.push({ upload, picture });
    },
  };
}
