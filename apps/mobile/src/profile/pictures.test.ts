import { ApiError, type PictureUpload } from '@konvami/api-client';
import { centeredSquare, createPictureSender } from './pictures';

const UPLOAD: PictureUpload = {
  uploadId: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  url: 'https://files.test/',
  fields: { key: 'uploads/amara/a.jpg', 'Content-Type': 'image/jpeg', policy: 'signed' },
};

describe('the square cut from a photo', () => {
  it.each([
    [
      { width: 4000, height: 3000 },
      { originX: 500, originY: 0, width: 3000, height: 3000 },
    ],
    [
      { width: 3000, height: 4000 },
      { originX: 0, originY: 500, width: 3000, height: 3000 },
    ],
    [
      { width: 512, height: 512 },
      { originX: 0, originY: 0, width: 512, height: 512 },
    ],
    [
      { width: 801, height: 600 },
      { originX: 100, originY: 0, width: 600, height: 600 },
    ],
  ])('is the middle of %j', (photo, square) => {
    expect(centeredSquare(photo.width, photo.height)).toEqual(square);
  });
});

describe('sending a photo', () => {
  function setup(answer: Response | Error) {
    const requests: { url: string; method?: string; entries: [string, unknown][] }[] = [];
    const send = createPictureSender({
      fetch: async (url, init) => {
        const body = init?.body as FormData;
        requests.push({ url: String(url), method: init?.method, entries: [...body.entries()] });
        if (answer instanceof Error) throw answer;
        return answer;
      },
      filePart: async (picture) => `file:${picture.uri}`,
    });
    return { send, requests };
  }

  it('posts the form’s fields and then the file, which the store requires to come last', async () => {
    const { send, requests } = setup(new Response(null, { status: 204 }));

    await send(UPLOAD, { uri: 'file:///tmp/me.jpg' });

    expect(requests).toEqual([
      {
        url: 'https://files.test/',
        method: 'POST',
        entries: [
          ['key', 'uploads/amara/a.jpg'],
          ['Content-Type', 'image/jpeg'],
          ['policy', 'signed'],
          ['file', 'file:file:///tmp/me.jpg'],
        ],
      },
    ]);
  });

  it('reports a store that refuses the file', async () => {
    const { send } = setup(
      new Response('<Error><Code>EntityTooLarge</Code></Error>', { status: 400 }),
    );

    await expect(send(UPLOAD, { uri: 'file:///tmp/me.jpg' })).rejects.toMatchObject({
      code: 'upload_failed',
      status: 400,
    });
  });

  it('reports a failed connection as a network error', async () => {
    const { send } = setup(new TypeError('Network request failed'));

    const error = await send(UPLOAD, { uri: 'file:///tmp/me.jpg' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('network');
  });
});
