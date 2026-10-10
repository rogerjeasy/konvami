import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { createLibraryStore, PAGE_SIZE } from './library-store';

function setup(conversations = 0) {
  const api = createFakeApi();
  api.enterApp();
  // Oldest first, so that the newest has the highest number.
  for (let n = conversations; n >= 1; n -= 1) api.talked(0, { id: `rtc_${n}`, hoursAgo: n });
  return { api, store: createLibraryStore(api) };
}

const ids = (store: ReturnType<typeof createLibraryStore>) =>
  store.getState().conversations.map((conversation) => conversation.id);
const pages = (api: FakeApi) => api.calls.filter(([method]) => method === 'getConversations');

describe('library store', () => {
  it('starts empty and not loaded', () => {
    expect(setup().store.getState()).toEqual({
      phase: 'idle',
      conversations: [],
      hasMore: false,
      error: null,
      loadingMore: false,
      moreFailed: false,
    });
  });

  it('loads the newest conversations first', async () => {
    const { store } = setup(3);

    const loading = store.load();
    expect(store.getState().phase).toBe('loading');
    await loading;

    expect(store.getState()).toMatchObject({ phase: 'ready', hasMore: false });
    expect(ids(store)).toEqual(['rtc_1', 'rtc_2', 'rtc_3']);
  });

  it('loads once, however often it is asked', async () => {
    const { api, store } = setup(1);

    await Promise.all([store.load(), store.load()]);
    await store.load();

    expect(pages(api)).toHaveLength(1);
  });

  it('reads on from where the first page ended', async () => {
    const { api, store } = setup(PAGE_SIZE + 2);
    await store.load();
    expect(store.getState().hasMore).toBe(true);
    expect(ids(store)).toHaveLength(PAGE_SIZE);

    const more = store.more();
    expect(store.getState().loadingMore).toBe(true);
    await more;

    expect(store.getState()).toMatchObject({ hasMore: false, loadingMore: false });
    expect(ids(store)).toHaveLength(PAGE_SIZE + 2);
    expect(ids(store).slice(-2)).toEqual([`rtc_${PAGE_SIZE + 1}`, `rtc_${PAGE_SIZE + 2}`]);
    expect(new Set(ids(store)).size).toBe(PAGE_SIZE + 2);
    expect(pages(api)).toHaveLength(2);
  });

  it('does not read on while it is already doing so, or when nothing is left', async () => {
    const { api, store } = setup(PAGE_SIZE + 1);
    await store.load();

    await Promise.all([store.more(), store.more()]);
    await store.more();

    expect(pages(api)).toHaveLength(2);
  });

  it('reports why the first page failed and can be asked again', async () => {
    const { api, store } = setup(2);
    api.failNext('getConversations', 'network');

    await store.load();
    expect(store.getState()).toMatchObject({ phase: 'failed', error: 'network' });

    await store.reload();
    expect(ids(store)).toEqual(['rtc_1', 'rtc_2']);
  });

  it('keeps the list when reading on fails, and can try again', async () => {
    const { api, store } = setup(PAGE_SIZE + 1);
    await store.load();
    api.failNext('getConversations', 'network');

    await store.more();
    expect(store.getState()).toMatchObject({ phase: 'ready', moreFailed: true, hasMore: true });
    expect(ids(store)).toHaveLength(PAGE_SIZE);

    await store.more();
    expect(store.getState()).toMatchObject({ moreFailed: false, hasMore: false });
    expect(ids(store)).toHaveLength(PAGE_SIZE + 1);
  });

  it('shows a new conversation after a refresh, without emptying the list meanwhile', async () => {
    const { api, store } = setup(1);
    await store.load();
    api.talked(1, { id: 'rtc_new', hoursAgo: 0 });
    const release = api.hold('getConversations');

    const refreshing = store.refresh();
    expect(ids(store)).toEqual(['rtc_1']);
    release();
    await refreshing;

    expect(ids(store)).toEqual(['rtc_new', 'rtc_1']);
  });

  it('keeps the list when a refresh fails', async () => {
    const { api, store } = setup(1);
    await store.load();
    api.failNext('getConversations', 'network');

    await store.refresh();

    expect(store.getState()).toMatchObject({ phase: 'ready', error: null });
    expect(ids(store)).toEqual(['rtc_1']);
  });

  it('a refresh before anything was loaded does nothing: the list loads when it is opened', async () => {
    const { api, store } = setup(1);

    await store.refresh();

    expect(store.getState().phase).toBe('idle');
    expect(pages(api)).toHaveLength(0);
  });

  it('forgets everything on reset and drops an answer that arrives afterwards', async () => {
    const { api, store } = setup(1);
    const release = api.hold('getConversations');
    const loading = store.load();

    store.reset();
    release();
    await loading;

    expect(store.getState()).toMatchObject({ phase: 'idle', conversations: [] });
  });
});
