import { createFakeApi } from '@/test/fake-api';
import { createHomeStore, STALE_AFTER_MS } from './home-store';

function setup({ timeZone = 'Europe/Zurich' }: { timeZone?: string } = {}) {
  const api = createFakeApi();
  api.enterApp();
  const clock = { now: 1_000_000 };
  const store = createHomeStore(api, { timeZone: () => timeZone, now: () => clock.now });
  const requests = () => api.calls.filter(([method]) => method === 'getHome');
  return { api, store, clock, requests };
}

describe('home store', () => {
  it('starts with nothing loaded', () => {
    expect(setup().store.getState()).toEqual({
      phase: 'idle',
      data: null,
      error: null,
      refreshing: false,
    });
  });

  it('loads home for the device’s time zone', async () => {
    const { store, requests } = setup({ timeZone: 'Africa/Dakar' });

    const loading = store.load();
    expect(store.getState().phase).toBe('loading');
    await loading;

    const state = store.getState();
    expect(state.phase).toBe('ready');
    expect(state.data?.partners.map((partner) => partner.persona.name)).toEqual(['Lena', 'Jonas']);
    expect(requests()).toEqual([['getHome', 'Africa/Dakar']]);
  });

  it('loads once, however often it is asked', async () => {
    const { store, requests } = setup();

    await Promise.all([store.load(), store.load()]);
    await store.load();

    expect(requests()).toHaveLength(1);
  });

  it('tells its listeners about every change until they unsubscribe', async () => {
    const { store } = setup();
    const phases: string[] = [];
    const unsubscribe = store.subscribe(() => phases.push(store.getState().phase));

    await store.load();
    unsubscribe();
    await store.reload();

    expect(phases).toEqual(['loading', 'ready']);
  });

  it('reports why loading failed and can be asked again', async () => {
    const { api, store } = setup();
    api.failNext('getHome', 'network');

    await store.load();
    expect(store.getState()).toMatchObject({ phase: 'failed', data: null, error: 'network' });

    await store.reload();
    expect(store.getState().phase).toBe('ready');
  });

  it('counts a client that breaks instead of answering as a failed load', async () => {
    const clock = { now: 1_000_000 };
    const broken = {
      getHome: () => {
        throw new TypeError('undefined is not a function');
      },
    };
    const store = createHomeStore(broken, {
      timeZone: () => 'Europe/Zurich',
      now: () => clock.now,
    });

    await store.load();

    expect(store.getState()).toMatchObject({ phase: 'failed', error: 'unknown' });
  });

  it('keeps showing what it has while it refreshes', async () => {
    const { api, store } = setup();
    await store.load();
    api.talked(0, { minutes: 10 });
    const release = api.hold('getHome');

    const refreshing = store.refresh();
    expect(store.getState()).toMatchObject({ phase: 'ready', refreshing: true });
    expect(store.getState().data?.activity.todaySeconds).toBe(0);
    release();
    await refreshing;

    expect(store.getState()).toMatchObject({ phase: 'ready', refreshing: false });
    expect(store.getState().data?.activity.todaySeconds).toBe(600);
  });

  it('keeps what it has when a refresh fails', async () => {
    const { api, store } = setup();
    await store.load();
    api.failNext('getHome', 'network');

    await store.refresh();

    expect(store.getState()).toMatchObject({ phase: 'ready', error: null, refreshing: false });
    expect(store.getState().data?.language).toBe('de');
  });

  it('a refresh before anything was loaded is a first load', async () => {
    const { store } = setup();

    await store.refresh();

    expect(store.getState().phase).toBe('ready');
  });

  it('refreshes on a visit only when what it has is no longer fresh', async () => {
    const { store, clock, requests } = setup();
    await store.load();

    clock.now += STALE_AFTER_MS - 1;
    await store.revisit();
    expect(requests()).toHaveLength(1);

    clock.now += 1;
    await store.revisit();
    expect(requests()).toHaveLength(2);

    // The refresh made it fresh again.
    await store.revisit();
    expect(requests()).toHaveLength(2);
  });

  it('forgets everything on reset and drops an answer that arrives afterwards', async () => {
    const { api, store } = setup();
    const release = api.hold('getHome');
    const loading = store.load();

    store.reset();
    release();
    await loading;

    expect(store.getState().phase).toBe('idle');
  });
});
