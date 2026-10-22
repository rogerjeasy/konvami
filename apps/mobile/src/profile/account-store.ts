import type { ApiClient } from '@konvami/api-client';
import type { PickedPicture, PictureSender } from './pictures';

/**
 * What the backend keeps for the account besides the profile: the learner's photo, and whether
 * the account is the owner's (who may see the costs). Name and email live with the session
 * (`useSession`). The photo's address is short-lived, so it is read anew each time the app
 * starts.
 */
export interface AccountState {
  /** `failed` only means the photo is unknown: the screens then show the learner's initial. */
  phase: 'idle' | 'loading' | 'ready' | 'failed';
  pictureUrl: string | null;
  /** The owner's account, which may open the costs page (false until known). */
  owner: boolean;
}

export interface AccountStore {
  getState(): AccountState;
  subscribe(listener: () => void): () => void;
  /** Loads once; after a failure the next call tries again. Never throws. */
  load(): Promise<void>;
  /**
   * Sends a picked photo and makes it the learner's. Rejects with an `ApiError` and keeps the
   * photo that was there.
   */
  setPicture(picture: PickedPicture): Promise<void>;
  removePicture(): Promise<void>;
  /** Forgets everything (sign-out): the next account must not see this one's photo. */
  reset(): void;
}

const IDLE: AccountState = { phase: 'idle', pictureUrl: null, owner: false };

export function createAccountStore(
  api: Pick<ApiClient, 'getAccount' | 'startPictureUpload' | 'confirmPicture' | 'removePicture'>,
  send: PictureSender,
): AccountStore {
  let state: AccountState = IDLE;
  let loading: Promise<void> | null = null;
  /** Raised by `reset`, so an answer that arrives afterwards is dropped. */
  let generation = 0;
  const listeners = new Set<() => void>();

  function setState(next: AccountState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function show(account: { picture: { url: string } | null; owner: boolean }, from: number) {
    if (from !== generation) return;
    setState({ phase: 'ready', pictureUrl: account.picture?.url ?? null, owner: account.owner });
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    load() {
      if (loading) return loading;
      if (state.phase === 'ready') return Promise.resolve();
      const from = generation;
      setState({ phase: 'loading', pictureUrl: null, owner: false });
      const request = api
        .getAccount()
        .then((account) => show(account, from))
        .catch(() => {
          if (from === generation) setState({ phase: 'failed', pictureUrl: null, owner: false });
        })
        .finally(() => {
          if (loading === request) loading = null;
        });
      loading = request;
      return request;
    },

    async setPicture(picture) {
      const from = generation;
      const upload = await api.startPictureUpload();
      await send(upload, picture);
      show(await api.confirmPicture(upload.uploadId), from);
    },

    async removePicture() {
      const from = generation;
      show(await api.removePicture(), from);
    },

    reset() {
      generation += 1;
      loading = null;
      setState(IDLE);
    },
  };
}
