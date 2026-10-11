import { createFakeApi, FAKE_DUE_IN_MS, type FakeApi } from '@/test/fake-api';
import { createReviewSession, type ReviewState } from './review-session';

async function setup({ cards = true } = {}) {
  const api = createFakeApi();
  api.enterApp();
  if (cards) await api.learning();
  return { api, session: createReviewSession(api) };
}

const reviews = (api: FakeApi) => api.calls.filter(([method]) => method === 'reviewCard');

/** The card on screen: its front, whether its answer shows, and where it stands. */
function showing(state: ReviewState) {
  if (state.phase !== 'card') throw new Error(`no card on screen: ${state.phase}`);
  return [state.item.card.front, state.revealed, `${state.position}/${state.total}`];
}

describe('review session', () => {
  it('starts with the card that has waited longest, its answer hidden', async () => {
    const { session } = await setup();
    expect(session.getState()).toEqual({ phase: 'loading' });

    await session.start();

    expect(showing(session.getState())).toEqual(['das Wochenende', false, '1/3']);
    expect(session.getState()).toMatchObject({ saving: false, error: null });
  });

  it('shows the answer when asked, with when the card would come back', async () => {
    const { session } = await setup();
    await session.start();

    session.reveal();

    const state = session.getState();
    expect(showing(state)).toEqual(['das Wochenende', true, '1/3']);
    expect(state.phase === 'card' && state.item.dueIn).toEqual({
      again: FAKE_DUE_IN_MS.again / 1000,
      hard: FAKE_DUE_IN_MS.hard / 1000,
      good: FAKE_DUE_IN_MS.good / 1000,
      easy: FAKE_DUE_IN_MS.easy / 1000,
    });
  });

  it('stores each rating and moves on, until every card is done', async () => {
    const { api, session } = await setup();
    await session.start();

    for (const rating of ['good', 'hard', 'easy'] as const) {
      session.reveal();
      await session.rate(rating);
    }

    expect(session.getState()).toEqual({ phase: 'done', reviewed: 3 });
    expect(reviews(api).map(([, id, rating]) => [id, rating])).toEqual([
      ['card_1', 'good'],
      ['card_2', 'hard'],
      ['card_3', 'easy'],
    ]);
  });

  it('brings a card that was not known back at the end of the sitting', async () => {
    const { api, session } = await setup();
    await session.start();
    session.reveal();

    await session.rate('again');
    expect(showing(session.getState())).toEqual(['die Ausstellung', false, '1/3']);
    session.reveal();
    await session.rate('good');
    session.reveal();
    await session.rate('good');

    // The first card again; the server's times for it are no longer the ones read at the start.
    const again = session.getState();
    expect(showing(again)).toEqual(['das Wochenende', false, '3/3']);
    expect(again.phase === 'card' && again.item.dueIn).toBeNull();
    session.reveal();
    await session.rate('good');

    expect(session.getState()).toEqual({ phase: 'done', reviewed: 3 });
    expect(reviews(api)).toHaveLength(4);
  });

  it('takes no rating before the answer is shown, and one at a time', async () => {
    const { api, session } = await setup();
    await session.start();

    await session.rate('good');
    expect(reviews(api)).toHaveLength(0);

    session.reveal();
    const release = api.hold('reviewCard');
    const first = session.rate('good');
    expect(session.getState()).toMatchObject({ phase: 'card', saving: true });
    const second = session.rate('easy');
    release();
    await Promise.all([first, second]);

    expect(reviews(api)).toHaveLength(1);
    expect(showing(session.getState())).toEqual(['die Ausstellung', false, '2/3']);
  });

  it('says so when there is nothing to review', async () => {
    const { session } = await setup({ cards: false });

    await session.start();

    expect(session.getState()).toEqual({ phase: 'empty' });
  });

  it('says why the cards could not be read, and reads them when asked again', async () => {
    const { api, session } = await setup();
    api.failNext('getDueCards', 'network');

    await session.start();
    expect(session.getState()).toEqual({ phase: 'failed', code: 'network' });

    await session.start();
    expect(showing(session.getState())).toEqual(['das Wochenende', false, '1/3']);
  });

  it('keeps the card when its rating could not be stored, so it can be rated again', async () => {
    const { api, session } = await setup();
    await session.start();
    session.reveal();
    api.failNext('reviewCard', 'network');

    await session.rate('good');
    expect(session.getState()).toMatchObject({ phase: 'card', saving: false, error: 'network' });
    expect(showing(session.getState())).toEqual(['das Wochenende', true, '1/3']);

    await session.rate('good');
    expect(showing(session.getState())).toEqual(['die Ausstellung', false, '2/3']);
  });

  it.each(['conflict', 'not_found'])(
    'moves on from a card that was reviewed or removed elsewhere meanwhile (%s)',
    async (code) => {
      const { api, session } = await setup();
      await session.start();
      session.reveal();
      api.failNext('reviewCard', code);

      await session.rate('good');

      expect(showing(session.getState())).toEqual(['die Ausstellung', false, '2/3']);
    },
  );

  it('tells its listeners about every change until they unsubscribe', async () => {
    const { session } = await setup();
    const seen: string[] = [];
    const unsubscribe = session.subscribe(() => seen.push(session.getState().phase));

    await session.start();
    session.reveal();
    unsubscribe();
    await session.rate('good');

    expect(seen).toEqual(['card', 'card']);
  });
});
