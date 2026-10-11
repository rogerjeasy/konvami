import { ApiError } from '@konvami/api-client';
import { createFakeApi } from '@/test/fake-api';
import { createDeckStore } from './deck-store';

async function setup({ cards = true } = {}) {
  const api = createFakeApi();
  api.enterApp();
  const made = cards ? await api.learning() : [];
  return { api, made, store: createDeckStore(api) };
}

describe('deck store', () => {
  it('loads the cards newest first, with how many there are and how many are due', async () => {
    const { store } = await setup();

    await store.load();

    const state = store.getState();
    expect(state.phase).toBe('ready');
    expect(state.items.map((card) => card.front)).toEqual([
      'Ich habe nach Berlin gefahren',
      'die Ausstellung',
      'das Wochenende',
    ]);
    expect(state.summary).toEqual({ total: 3, due: 3 });
  });

  it('is empty for a learner without cards', async () => {
    const { store } = await setup({ cards: false });

    await store.load();

    expect(store.getState()).toMatchObject({
      phase: 'ready',
      items: [],
      summary: { total: 0, due: 0 },
    });
  });

  it('removes a card and reads the deck again', async () => {
    const { made, store } = await setup();
    await store.load();

    await store.remove(made[0]!.id);

    expect(store.getState().items.map((card) => card.front)).toEqual([
      'Ich habe nach Berlin gefahren',
      'die Ausstellung',
    ]);
    expect(store.getState().summary).toEqual({ total: 2, due: 2 });
  });

  it('says why a card could not be removed, and keeps it', async () => {
    const { api, made, store } = await setup();
    await store.load();
    api.failNext('removeCard', 'network');

    await expect(store.remove(made[0]!.id)).rejects.toEqual(new ApiError('network'));

    expect(store.getState().items).toHaveLength(3);
  });

  it('shows what changed elsewhere after a refresh', async () => {
    const { api, made, store } = await setup();
    await store.load();
    await api.reviewCard(made[0]!.id, 'good');

    await store.refresh();

    expect(store.getState().summary).toEqual({ total: 3, due: 2 });
  });
});
