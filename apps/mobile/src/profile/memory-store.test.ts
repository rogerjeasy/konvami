import { createFakeApi, FAKE_MEMORIES } from '@/test/fake-api';
import { createMemoryStore } from './memory-store';

const INTERVIEW = FAKE_MEMORIES[3]!.id;

function setup() {
  const api = createFakeApi();
  api.enterApp();
  api.remembering();
  const store = createMemoryStore(api, () => 1_000_000);
  const count = (method: string) => api.calls.filter(([called]) => called === method).length;
  return { api, store, count };
}

const texts = (store: ReturnType<typeof setup>['store']) =>
  store.getState().data?.memories.map(({ text }) => text);

describe('the memory store', () => {
  it('reads what the partners know, once', async () => {
    const { store, count } = setup();

    await Promise.all([store.load(), store.load()]);

    const state = store.getState();
    expect(state.phase).toBe('ready');
    expect(state.data?.enabled).toBe(true);
    expect(state.data?.memories).toEqual(FAKE_MEMORIES);
    expect(count('getMemories')).toBe(1);
  });

  it('says why it could not be read, and reads it when asked again', async () => {
    const { api, store } = setup();
    api.failNext('getMemories', 'network');

    await store.load();
    expect(store.getState()).toMatchObject({ phase: 'failed', data: null, error: 'network' });

    await store.reload();
    expect(store.getState().phase).toBe('ready');
  });

  it('turns memory off with the server’s answer, without reading everything again', async () => {
    const { store, count } = setup();
    await store.load();

    await store.configure({ enabled: false });

    expect(store.getState().data?.enabled).toBe(false);
    expect(texts(store)).toHaveLength(4);
    expect(count('getMemories')).toBe(1);
  });

  it('keeps the topics the learner wants left alone', async () => {
    const { store } = setup();
    await store.load();

    await store.configure({ avoidTopics: ['politics', 'my ex'] });

    expect(store.getState().data?.avoidTopics).toEqual(['politics', 'my ex']);
  });

  it('keeps what it had when a setting is refused', async () => {
    const { store } = setup();
    await store.load();
    await store.configure({ avoidTopics: ['politics'] });

    await expect(store.configure({ avoidTopics: ['Politics', 'politics'] })).rejects.toMatchObject({
      code: 'invalid_value',
    });

    expect(store.getState().data?.avoidTopics).toEqual(['politics']);
  });

  it('puts a reworded memory in the place of the old one', async () => {
    const { store } = setup();
    await store.load();

    const changed = await store.change(INTERVIEW, { text: 'Interview at Planzer.' });

    expect(changed.text).toBe('Interview at Planzer.');
    expect(texts(store)?.[3]).toBe('Interview at Planzer.');
    expect(texts(store)).toHaveLength(4);
  });

  it('keeps a memory as it was when the change is refused', async () => {
    const { store } = setup();
    await store.load();

    await expect(
      store.change(INTERVIEW, { text: 'Would rather not talk about politics!' }),
    ).rejects.toMatchObject({ code: 'duplicate' });

    expect(texts(store)?.[3]).toBe('Has a job interview at a logistics company in Zurich.');
  });

  it('forgets a memory', async () => {
    const { store, count } = setup();
    await store.load();

    await store.remove(INTERVIEW);

    expect(texts(store)).toHaveLength(3);
    expect(texts(store)).not.toContain('Has a job interview at a logistics company in Zurich.');
    expect(count('getMemories')).toBe(1);
  });

  it('reads again while showing what it had', async () => {
    const { api, store } = setup();
    await store.load();
    api.remembering(FAKE_MEMORIES.slice(0, 1));
    const phases: string[] = [];
    store.subscribe(() => phases.push(store.getState().phase));

    await store.refresh();

    expect(phases).toEqual(['ready', 'ready']);
    expect(texts(store)).toHaveLength(1);
  });

  it('drops an answer that arrives after the learner signed out', async () => {
    const { api, store } = setup();
    await store.load();
    const release = api.hold('configureMemories');

    const saving = store.configure({ enabled: false });
    store.reset();
    release();
    await saving;

    expect(store.getState()).toMatchObject({ phase: 'idle', data: null });
  });
});
