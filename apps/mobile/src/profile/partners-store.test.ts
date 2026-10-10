import { createFakeApi, FAKE_DRAFT } from '@/test/fake-api';
import { createPartnersStore } from './partners-store';

function setup() {
  const api = createFakeApi();
  api.enterApp();
  const changed = jest.fn();
  return { api, changed, store: createPartnersStore(api, changed) };
}

const names = (store: ReturnType<typeof setup>['store']) =>
  store.getState().partners?.map(({ name }) => name);

describe('the partners store', () => {
  it('reads the learner’s partners once', async () => {
    const { api, store } = setup();

    await Promise.all([store.load(), store.load()]);

    expect(store.getState().phase).toBe('ready');
    expect(names(store)).toEqual(['Lena', 'Jonas']);
    expect(api.calls.filter(([method]) => method === 'getPersonas')).toHaveLength(1);
  });

  it('says why the partners could not be read, and reads them when asked again', async () => {
    const { api, store } = setup();
    api.failNext('getPersonas', 'network');

    await store.load();
    expect(store.getState()).toEqual({ phase: 'failed', partners: null, error: 'network' });

    await store.reload();
    expect(names(store)).toEqual(['Lena', 'Jonas']);
  });

  it('adds a new partner at the end and says that the partners changed', async () => {
    const { store, changed } = setup();
    await store.load();

    const greta = await store.create(FAKE_DRAFT);

    expect(names(store)).toEqual(['Lena', 'Jonas', 'Greta']);
    expect(store.getState().partners?.[2]).toEqual(greta);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('keeps the list as it was when a partner is refused', async () => {
    const { api, store, changed } = setup();
    await store.load();
    api.failNext('createPersona', 'too_many');

    await expect(store.create(FAKE_DRAFT)).rejects.toMatchObject({ code: 'too_many' });

    expect(names(store)).toEqual(['Lena', 'Jonas']);
    expect(changed).not.toHaveBeenCalled();
  });

  it('replaces a changed partner in place', async () => {
    const { store, changed } = setup();
    await store.load();
    const lena = store.getState().partners![0]!;

    await store.change(lena.id, { name: 'Leni', age: 28 });

    expect(names(store)).toEqual(['Leni', 'Jonas']);
    expect(store.getState().partners?.[0]?.age).toBe(28);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('adds a copy after the others', async () => {
    const { store } = setup();
    await store.load();

    const copy = await store.duplicate(store.getState().partners![0]!.id);

    expect(copy.name).toBe('Lena 2');
    expect(names(store)).toEqual(['Lena', 'Jonas', 'Lena 2']);
  });

  it('removes a partner', async () => {
    const { store, changed } = setup();
    await store.load();

    await store.remove(store.getState().partners![0]!.id);

    expect(names(store)).toEqual(['Jonas']);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('works on the server’s list when it was not loaded yet', async () => {
    const { store } = setup();

    await store.create(FAKE_DRAFT);

    // Nothing was loaded, so nothing is shown as loaded: the next load reads all three.
    expect(store.getState().phase).toBe('idle');
    await store.load();
    expect(names(store)).toEqual(['Lena', 'Jonas', 'Greta']);
  });

  it('forgets everything at sign-out', async () => {
    const { store } = setup();
    await store.load();

    store.reset();

    expect(store.getState()).toEqual({ phase: 'idle', partners: null, error: null });
  });
});
