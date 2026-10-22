import { ApiError } from '@konvami/api-client';
import { createFakeApi } from '@/test/fake-api';
import { createAccountStore } from './account-store';
import type { PictureSender } from './pictures';

function setup({ send }: { send?: PictureSender } = {}) {
  const api = createFakeApi();
  const sent: string[] = [];
  const store = createAccountStore(
    api,
    send ??
      (async (upload, picture) => {
        sent.push(`${picture.uri} → ${upload.fields.key}`);
      }),
  );
  return { api, store, sent };
}

describe('the account store', () => {
  it('knows nothing until it has loaded', () => {
    expect(setup().store.getState()).toEqual({ phase: 'idle', pictureUrl: null, owner: false });
  });

  it('reads whether the learner has a photo', async () => {
    const { api, store } = setup();
    api.havePicture();

    await store.load();

    expect(store.getState()).toEqual({
      phase: 'ready',
      pictureUrl: 'https://files.test/users/amara/picture/earlier.jpg',
      owner: false,
    });
  });

  it('knows whether the account is the owner’s', async () => {
    const { api, store } = setup();
    api.beOwner();

    await store.load();

    expect(store.getState().owner).toBe(true);
  });

  it('loads once, however often it is asked', async () => {
    const { api, store } = setup();

    await Promise.all([store.load(), store.load()]);
    await store.load();

    expect(api.calls.filter(([method]) => method === 'getAccount')).toHaveLength(1);
  });

  it('goes on without a photo when the account cannot be read', async () => {
    const { api, store } = setup();
    api.failNext('getAccount', 'network');

    await store.load();

    expect(store.getState()).toEqual({ phase: 'failed', pictureUrl: null, owner: false });
    await store.load();
    expect(store.getState().phase).toBe('ready');
  });

  it('sends a new photo with the form it was given, then confirms it', async () => {
    const { api, store, sent } = setup();
    await store.load();

    await store.setPicture({ uri: 'file:///tmp/me.jpg' });

    const [uploadId] = api.uploads;
    expect(sent).toEqual([`file:///tmp/me.jpg → uploads/amara/${uploadId}.jpg`]);
    expect(store.getState().pictureUrl).toBe(
      `https://files.test/users/amara/picture/${uploadId}.jpg`,
    );
    expect(api.calls.map(([method]) => method)).toEqual([
      'getAccount',
      'startPictureUpload',
      'confirmPicture',
    ]);
  });

  it('keeps the old photo when the new one could not be sent', async () => {
    const { api, store } = setup({
      send: async () => {
        throw new ApiError('network');
      },
    });
    api.havePicture();
    await store.load();

    await expect(store.setPicture({ uri: 'file:///tmp/me.jpg' })).rejects.toMatchObject({
      code: 'network',
    });

    expect(store.getState().pictureUrl).toBe('https://files.test/users/amara/picture/earlier.jpg');
    expect(api.calls.some(([method]) => method === 'confirmPicture')).toBe(false);
  });

  it('removes the photo', async () => {
    const { api, store } = setup();
    api.havePicture();
    await store.load();

    await store.removePicture();

    expect(store.getState().pictureUrl).toBeNull();
    expect((await api.getAccount()).picture).toBeNull();
  });

  it('tells subscribers when the photo changes', async () => {
    const { store } = setup();
    await store.load();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    await store.setPicture({ uri: 'file:///tmp/me.jpg' });
    unsubscribe();
    await store.removePicture();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('forgets the photo at sign-out, and drops an answer that arrives afterwards', async () => {
    const { api, store } = setup();
    api.havePicture();
    const release = api.hold('getAccount');
    const loading = store.load();

    store.reset();
    release();
    await loading;

    expect(store.getState()).toEqual({ phase: 'idle', pictureUrl: null, owner: false });
  });
});
