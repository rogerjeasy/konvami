import { createFakeApi } from '@/test/fake-api';
import { createOfflineCache } from './cache';
import { createLibraryTools, exportTranscript } from './library';

async function setup() {
  const records = new Map<string, string>();
  const cache = createOfflineCache(
    {
      read: async (key) => records.get(key) ?? null,
      write: async (key, value) => {
        records.set(key, value);
      },
      remove: async (key) => {
        records.delete(key);
      },
    },
    () => 'alice',
  );
  const api = createFakeApi();
  api.enterApp();
  api.talked(0, { id: 'one' });
  const transcript = await api.getConversation('one');
  const media = {
    download: jest.fn(async (_url: string, key: string) => `file://${key}`),
    remove: jest.fn(async () => {}),
    share: jest.fn(async () => {}),
  };
  return { cache, transcript, media, tools: createLibraryTools(cache, media) };
}

describe('library tools', () => {
  it('keeps bookmarks and notes per conversation and turn', async () => {
    const { tools } = await setup();
    await tools.annotate('one', 2, { bookmarked: true, note: 'Ask about this' });
    expect((await tools.annotations('one'))['2']).toEqual({
      bookmarked: true,
      note: 'Ask about this',
    });
    expect(await tools.annotations('two')).toEqual({});
  });
  it('pins only after every recording has been downloaded, then removes its files', async () => {
    const { tools, transcript, media } = await setup();
    transcript.turns[0]!.audio = { url: 'https://example.test/one.wav', milliseconds: 1000 };
    await tools.pin(transcript);
    expect(await tools.pinned('one')).toBe(true);
    const local = await tools.local(transcript);
    expect(local.turns[0]!.audio?.url).toContain('file://');
    await tools.unpin('one');
    expect(await tools.pinned('one')).toBe(false);
    expect(media.remove).toHaveBeenCalledTimes(1);
  });
  it('cleans up partial downloads when a recording fails', async () => {
    const { tools, transcript, media } = await setup();
    transcript.turns[0]!.audio = { url: 'https://example.test/a.wav', milliseconds: 1000 };
    transcript.turns[1]!.audio = { url: 'https://example.test/b.wav', milliseconds: 1000 };
    media.download.mockRejectedValueOnce(new Error('network'));
    await expect(tools.pin(transcript)).rejects.toThrow('network');
    expect(await tools.pinned('one')).toBe(false);
  });
  it('exports spoken text and speaker labels without expiring media URLs', async () => {
    const { transcript } = await setup();
    transcript.turns[0]!.audio = { url: 'https://secret.test/signed', milliseconds: 1000 };
    const output = exportTranscript(transcript, 'json', { learner: 'You', partner: 'Partner' });
    expect(output).toContain(transcript.turns[0]!.text);
    expect(output).not.toContain('https://secret.test');
    expect(exportTranscript(transcript, 'txt', { learner: 'You', partner: 'Partner' })).toContain(
      'Lena:',
    );
  });
});
