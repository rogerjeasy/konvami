import { ApiError, type PictureUpload } from '@konvami/api-client';
import type { PickedPicture, PickResult, PictureDevice } from '@/profile/pictures';
import type { ClipPlayer } from '@/lib/clip-player';

/**
 * The device's side of the Profile screens for tests: a photo picker that answers what the
 * test says, an upload that records what it was sent, and an audio player whose clips end
 * when the test says so.
 */
export interface FakeProfileDevice {
  pictures: PictureDevice;
  samples: ClipPlayer;
  /** What the picker answers next (a chosen picture by default). */
  nextPick(result: PickResult): void;
  /** Makes the next upload fail with this code. */
  failNextSend(code: string): void;
  /** Every upload so far. */
  readonly sent: readonly { upload: PictureUpload; picture: PickedPicture }[];
  /** The address of the clip that is playing, or null. */
  readonly playing: string | null;
  /** Every clip that was started, in order. */
  readonly played: readonly string[];
  /** Lets the clip that is playing reach its end. */
  finishClip(): void;
}

export const FAKE_PICTURE: PickedPicture = { uri: 'file:///tmp/picked.jpg' };

export function createFakeProfileDevice(): FakeProfileDevice {
  let pick: PickResult = { status: 'picked', picture: FAKE_PICTURE };
  let sendFailure: string | null = null;
  const sent: { upload: PictureUpload; picture: PickedPicture }[] = [];
  const played: string[] = [];
  let current: { url: string; done: () => void } | null = null;

  function stop() {
    const ending = current;
    current = null;
    ending?.done();
  }

  return {
    sent,
    played,
    get playing() {
      return current?.url ?? null;
    },
    nextPick: (result) => void (pick = result),
    failNextSend: (code) => void (sendFailure = code),
    finishClip: stop,
    pictures: {
      pick: async () => pick,
      async send(upload, picture) {
        if (sendFailure) {
          const code = sendFailure;
          sendFailure = null;
          throw new ApiError(code);
        }
        sent.push({ upload, picture });
      },
    },
    samples: {
      play(url, onDone) {
        stop();
        played.push(url);
        current = { url, done: onDone };
      },
      stop,
    },
  };
}
