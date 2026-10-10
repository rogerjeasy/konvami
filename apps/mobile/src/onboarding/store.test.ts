import { ApiError } from '@konvami/api-client';
import { createFakeApi, ESSENTIAL_ANSWERS, FAKE_CATALOG } from '@/test/fake-api';
import { createOnboardingStore, type OnboardingStore } from './store';

function setup() {
  const api = createFakeApi();
  return { api, store: createOnboardingStore(api) };
}

const startingLevel = (store: OnboardingStore) =>
  store.getState().data?.profile.languages.de?.starting_level?.value;

describe('loading', () => {
  it('starts with nothing loaded', () => {
    expect(setup().store.getState()).toEqual({ phase: 'idle', data: null, error: null });
  });

  it('loads the catalog, the profile and the stage together', async () => {
    const { api, store } = setup();
    api.answer(ESSENTIAL_ANSWERS.slice(0, 3));

    await store.load();

    const { phase, data } = store.getState();
    expect(phase).toBe('ready');
    expect(data?.catalog).toEqual(FAKE_CATALOG);
    expect(data?.essentials.explanationLanguage).toBe('en');
    expect(data?.status).toEqual({
      stage: 'essentials',
      missing: ['goals', 'exam', 'self_assessed_level', 'course'],
      placement: 'not_started',
    });
  });

  it('shows as loading while the answer is on its way', async () => {
    const { api, store } = setup();
    const release = api.hold();

    const loading = store.load();
    expect(store.getState().phase).toBe('loading');
    release();
    await loading;

    expect(store.getState().phase).toBe('ready');
  });

  it('asks only once when two screens load at the same time', async () => {
    const { api, store } = setup();

    await Promise.all([store.load(), store.load()]);

    expect(api.calls.filter(([method]) => method === 'getProfile')).toHaveLength(1);
  });

  it('does not ask again once loaded, unless told to reload', async () => {
    const { api, store } = setup();
    await store.load();
    await store.load();
    expect(api.calls.filter(([method]) => method === 'getProfile')).toHaveLength(1);

    await store.reload();

    expect(api.calls.filter(([method]) => method === 'getProfile')).toHaveLength(2);
  });

  it('reports why loading failed and recovers on the next try', async () => {
    const { api, store } = setup();
    api.failNext('getProfile', 'network');

    await store.load();
    expect(store.getState()).toEqual({ phase: 'failed', data: null, error: 'network' });

    await store.load();
    expect(store.getState().phase).toBe('ready');
  });

  it('tells its listeners about every change', async () => {
    const { store } = setup();
    const phases: string[] = [];
    const stop = store.subscribe(() => phases.push(store.getState().phase));

    await store.load();
    stop();
    await store.reload();

    expect(phases).toEqual(['loading', 'ready']);
  });
});

describe('saving answers', () => {
  it('stores the answers and brings back the new profile and stage', async () => {
    const { api, store } = setup();
    await store.load();

    await store.save([
      { field: 'target_language', value: 'de' },
      { field: 'self_assessed_level', value: 'B1' },
    ]);

    const { data } = store.getState();
    expect(data?.essentials.selfAssessedLevel).toBe('B1');
    expect(data?.status.missing).toEqual([
      'explanation_language',
      'explanation_usage',
      'goals',
      'exam',
      'course',
    ]);
    expect(api.calls).toContainEqual([
      'updateProfile',
      [
        { field: 'target_language', value: 'de' },
        { field: 'self_assessed_level', value: 'B1' },
      ],
    ]);
  });

  it('keeps what was loaded when a save is refused, and passes the reason on', async () => {
    const { api, store } = setup();
    api.answer(ESSENTIAL_ANSWERS.slice(0, 1));
    await store.load();
    api.failNext('updateProfile', 'invalid_value', 'self_assessed_level');

    const save = store.save([{ field: 'self_assessed_level', value: 'Z9' }]);

    await expect(save).rejects.toMatchObject({
      code: 'invalid_value',
      field: 'self_assessed_level',
    });
    await expect(save).rejects.toBeInstanceOf(ApiError);
    expect(store.getState().phase).toBe('ready');
    expect(store.getState().data?.essentials.selfAssessedLevel).toBeNull();
  });
});

describe('moving on', () => {
  it('confirms the review and takes the next stage', async () => {
    const { api, store } = setup();
    api.answer(ESSENTIAL_ANSWERS);
    await store.load();
    expect(store.getState().data?.status.stage).toBe('review');

    await store.confirmEssentials();

    expect(store.getState().data?.status.stage).toBe('placement');
  });

  it('postpones the placement test and re-reads the profile, which now has a starting level', async () => {
    const { api, store } = setup();
    api.answer(ESSENTIAL_ANSWERS);
    await store.load();
    await store.confirmEssentials();
    const readsBefore = api.calls.filter(([method]) => method === 'getProfile').length;

    await store.skipPlacement();

    expect(store.getState().data?.status.stage).toBe('partners');
    expect(api.calls.filter(([method]) => method === 'getProfile')).toHaveLength(readsBefore + 1);
  });
});

describe('after the placement test', () => {
  async function tested() {
    const { api, store } = setup();
    api.advanceTo('placement');
    await store.load();
    return { api, store };
  }

  it('refreshes the stage and the profile without showing a loading state', async () => {
    const { api, store } = await tested();
    const phases: string[] = [];
    store.subscribe(() => phases.push(store.getState().phase));
    api.assess('decided');

    await store.refresh();

    expect(phases).toEqual(['ready']);
    expect(store.getState().data?.status).toMatchObject({
      stage: 'partners',
      placement: 'decided',
    });
    expect(startingLevel(store)).toBe('B1');
  });

  it('keeps what it has when a refresh fails', async () => {
    const { api, store } = await tested();
    api.failNext('getOnboarding', 'network');

    await expect(store.refresh()).rejects.toMatchObject({ code: 'network' });

    expect(store.getState().data?.status.stage).toBe('placement');
  });

  it('starts at the measured level when the learner chooses it', async () => {
    const { api, store } = await tested();
    api.assess('measured');

    await store.decidePlacement('measured');

    expect(api.calls).toContainEqual(['decidePlacement', 'measured']);
    expect(store.getState().data?.status.stage).toBe('partners');
    expect(startingLevel(store)).toBe('B1');
  });

  it('starts at the learner’s own estimate when they prefer it', async () => {
    const { api, store } = await tested();
    api.assess('measured');

    await store.decidePlacement('self');

    expect(startingLevel(store)).toBe('A2');
  });
});

describe('the placement result', () => {
  it('is not known until it has been asked for', async () => {
    const { api, store } = setup();
    api.advanceTo('placement');
    await store.load();

    expect(store.getState().data?.placement).toBeNull();
  });

  it('is read from the server and kept', async () => {
    const { api, store } = setup();
    api.advanceTo('placement');
    await store.load();
    api.assess('measured');

    const placement = await store.checkPlacement();

    expect(placement).toMatchObject({ status: 'measured', differs: true, selfAssessed: 'A2' });
    expect(store.getState().data?.placement).toEqual(placement);
  });

  it('brings the stage up to date when the test has moved on', async () => {
    const { api, store } = setup();
    api.advanceTo('placement');
    await store.load();
    api.assess('decided');

    await store.checkPlacement();

    expect(store.getState().data?.status).toMatchObject({
      stage: 'partners',
      placement: 'decided',
    });
    expect(startingLevel(store)).toBe('B1');
  });

  it('does not re-read the stage while nothing has changed', async () => {
    const { api, store } = setup();
    api.advanceTo('placement');
    await store.load();
    const reads = () => api.calls.filter(([method]) => method === 'getOnboarding').length;
    const before = reads();

    await store.checkPlacement();

    expect(reads()).toBe(before);
  });
});

describe('starter partners', () => {
  async function atPartners() {
    const { api, store } = setup();
    api.advanceTo('partners');
    await store.load();
    return { api, store };
  }
  const names = (store: OnboardingStore) =>
    store.getState().data?.partners?.map((partner) => partner.name);

  it('are not known until they have been asked for', async () => {
    const { store } = await atPartners();

    expect(store.getState().data?.partners).toBeNull();
  });

  it('are proposed by the server and kept', async () => {
    const { store } = await atPartners();

    await store.proposePartners();

    expect(names(store)).toEqual(['Lena', 'Jonas']);
  });

  it('take a new name or look', async () => {
    const { api, store } = await atPartners();
    await store.proposePartners();
    const lena = store.getState().data?.partners?.[0];

    await store.changePartner(lena?.id ?? '', { name: 'Leni' });

    expect(names(store)).toEqual(['Leni', 'Jonas']);
    expect(api.calls).toContainEqual(['changePersona', lena?.id, { name: 'Leni' }]);
  });

  it('stay as they are when a change is refused', async () => {
    const { api, store } = await atPartners();
    await store.proposePartners();
    const lena = store.getState().data?.partners?.[0];
    api.failNext('changePersona', 'invalid_value', 'name');

    await expect(store.changePartner(lena?.id ?? '', { name: '' })).rejects.toMatchObject({
      code: 'invalid_value',
    });

    expect(names(store)).toEqual(['Lena', 'Jonas']);
  });

  it('can be removed', async () => {
    const { store } = await atPartners();
    await store.proposePartners();
    const lena = store.getState().data?.partners?.[0];

    await store.removePartner(lena?.id ?? '');

    expect(names(store)).toEqual(['Jonas']);
  });

  it('are read back for a learner who has already confirmed them', async () => {
    const { api, store } = setup();
    api.advanceTo('ready');
    await store.load();

    await store.loadPartners();

    expect(names(store)).toEqual(['Lena', 'Jonas']);
    expect(api.calls.map(([method]) => method)).not.toContain('proposeStarterPersonas');
  });
});

describe('finishing', () => {
  it('confirms the partners, then completes onboarding', async () => {
    const { api, store } = setup();
    api.advanceTo('partners');
    await store.load();
    await store.proposePartners();

    await store.confirmPartners();
    expect(store.getState().data?.status.stage).toBe('ready');

    await store.complete();
    expect(store.getState().data?.status.stage).toBe('done');
  });

  it('passes on why the partners could not be confirmed', async () => {
    const { api, store } = setup();
    api.advanceTo('partners');
    await store.load();

    await expect(store.confirmPartners()).rejects.toMatchObject({ code: 'no_partners' });
    expect(store.getState().data?.status.stage).toBe('partners');
  });
});

describe('signing out', () => {
  it('forgets everything, so the next account starts clean', async () => {
    const { api, store } = setup();
    api.answer(ESSENTIAL_ANSWERS);
    await store.load();

    store.reset();

    expect(store.getState()).toEqual({ phase: 'idle', data: null, error: null });
  });

  it('ignores an answer that arrives after signing out', async () => {
    const { api, store } = setup();
    const release = api.hold();
    const loading = store.load();

    store.reset();
    release();
    await loading;

    expect(store.getState().phase).toBe('idle');
  });
});
