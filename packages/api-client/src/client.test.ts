import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, type ApiClientOptions } from './client.ts';

const PROFILE = { targetLanguage: 'de', global: {}, languages: {} };

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fetch that answers from a queue and records what it was asked. */
function fakeFetch(...answers: (Response | Error)[]) {
  const calls: Call[] = [];
  const fetch: NonNullable<ApiClientOptions['fetch']> = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const answer = answers.shift();
    if (!answer) throw new Error('fakeFetch: no answer left');
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

function client(fetch: ApiClientOptions['fetch'], overrides: Partial<ApiClientOptions> = {}) {
  const sleeps: number[] = [];
  const api = createApiClient({
    baseUrl: 'https://api.example.test',
    getAccessToken: async () => 'token-1',
    fetch,
    sleep: async (ms) => void sleeps.push(ms),
    ...overrides,
  });
  return { api, sleeps };
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected the call to fail');
}

describe('api client', () => {
  it('reads with the signed-in user’s access token', async () => {
    const { fetch, calls } = fakeFetch(json(200, PROFILE));

    const profile = await client(fetch).api.getProfile();

    expect(profile).toEqual(PROFILE);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: 'https://api.example.test/v1/profile',
      method: 'GET',
      headers: { authorization: 'Bearer token-1' },
    });
  });

  it('sends profile changes as JSON', async () => {
    const { fetch, calls } = fakeFetch(json(200, PROFILE));

    await client(fetch).api.updateProfile([{ field: 'target_language', value: 'de' }]);

    expect(calls[0]).toMatchObject({
      url: 'https://api.example.test/v1/profile',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: { changes: [{ field: 'target_language', value: 'de' }] },
    });
  });

  it('posts the onboarding steps to their routes', async () => {
    const stage = { stage: 'placement', missing: [], placement: 'not_started' };
    const { fetch, calls } = fakeFetch(json(200, stage), json(200, stage), json(200, stage));
    const { api } = client(fetch);

    await api.getOnboarding();
    await api.confirmEssentials();
    await api.skipPlacement();

    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      'GET /v1/onboarding',
      'POST /v1/onboarding/essentials/confirm',
      'POST /v1/placement/skip',
    ]);
  });

  it('reads the placement test and sends the choice of starting level', async () => {
    const placement = { status: 'measured', selfAssessed: 'A2', differs: true, result: null };
    const stage = { stage: 'partners', missing: [], placement: 'decided' };
    const { fetch, calls } = fakeFetch(json(200, placement), json(200, stage));
    const { api } = client(fetch);

    expect(await api.getPlacement()).toEqual(placement);
    expect(await api.decidePlacement('measured')).toEqual(stage);

    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      'GET /v1/placement',
      'POST /v1/placement/decision',
    ]);
    expect(calls[1]?.body).toEqual({ use: 'measured' });
  });

  it('proposes, reads, changes and removes partners', async () => {
    const look = {
      skin: 'honey',
      hair: 'bob',
      hairColor: 'espresso',
      top: 'teal',
      backdrop: 'mist',
      glasses: false,
      beard: false,
    };
    const lena = {
      id: '7b1c2f0e-6c1b-4a8e-9a55-0d2f6a1c9e11',
      role: 'buddy',
      name: 'Lena',
      age: 27,
      origin: 'Berlin',
      tagline: null,
      look,
    };
    const all = { personas: [lena] };
    const { fetch, calls } = fakeFetch(
      json(200, all),
      json(200, all),
      json(200, { ...lena, name: 'Leni' }),
      json(200, { personas: [] }),
    );
    const { api } = client(fetch);

    expect(await api.proposeStarterPersonas()).toEqual([lena]);
    expect(await api.getPersonas()).toEqual([lena]);
    expect((await api.changePersona(lena.id, { name: 'Leni' })).name).toBe('Leni');
    expect(await api.removePersona(lena.id)).toEqual([]);

    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      'POST /v1/personas/starter',
      'GET /v1/personas',
      `PATCH /v1/personas/${lena.id}`,
      `DELETE /v1/personas/${lena.id}`,
    ]);
    expect(calls[2]?.body).toEqual({ name: 'Leni' });
  });

  it('confirms the partners and completes onboarding', async () => {
    const stage = { stage: 'done', missing: [], placement: 'decided' };
    const { fetch, calls } = fakeFetch(json(200, stage), json(200, stage));
    const { api } = client(fetch);

    await api.confirmPartners();
    expect(await api.completeOnboarding()).toEqual(stage);

    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      'POST /v1/onboarding/partners/confirm',
      'POST /v1/onboarding/complete',
    ]);
  });

  it('starts a voice call with the WebRTC offer and returns the answer', async () => {
    const answer = { callId: 'rtc_1', sdp: 'v=0 answer', maxSeconds: 480 };
    const { fetch, calls } = fakeFetch(json(200, answer));

    const started = await client(fetch).api.startVoiceCall('onboarding', 'v=0 offer');

    expect(started).toEqual(answer);
    expect(calls[0]).toMatchObject({
      url: 'https://api.example.test/v1/voice/calls',
      method: 'POST',
      body: { purpose: 'onboarding', sdp: 'v=0 offer' },
    });
  });

  it.each([
    [403, 'consent_required'],
    [429, 'call_limit'],
    [503, 'voice_unavailable'],
  ])('passes on why a voice call was refused (%i)', async (status, code) => {
    const { fetch, calls } = fakeFetch(json(status, { error: { code, field: null } }));

    const error = await failure(client(fetch).api.startVoiceCall('onboarding', 'v=0 offer'));

    expect(error).toMatchObject({ code, status });
    expect(calls).toHaveLength(1);
  });

  it('accepts a base URL with a trailing slash', async () => {
    const { fetch, calls } = fakeFetch(json(200, {}));

    await client(fetch, { baseUrl: 'https://api.example.test/' }).api.getCatalog();

    expect(calls[0]?.url).toBe('https://api.example.test/v1/catalog');
  });

  it('turns a refused request into an error with the code and the field', async () => {
    const { fetch } = fakeFetch(
      json(422, { error: { code: 'invalid_value', field: 'self_assessed_level' } }),
    );

    const error = await failure(client(fetch).api.updateProfile([]));

    expect(error).toMatchObject({
      code: 'invalid_value',
      field: 'self_assessed_level',
      status: 422,
    });
  });

  it.each([
    [401, 'not_authenticated'],
    [403, 'not_authenticated'],
    [429, 'rate_limited'],
    [500, 'unknown'],
  ])('names a %i answered by the gateway itself', async (status, code) => {
    const { fetch } = fakeFetch(json(status, { message: 'Unauthorized' }));

    const error = await failure(client(fetch).api.getProfile());

    expect(error).toMatchObject({ code, status, field: null });
  });

  it('reports a failed connection as a network error', async () => {
    const { fetch } = fakeFetch(new TypeError('Network request failed'));

    const error = await failure(client(fetch).api.getProfile());

    expect(error).toMatchObject({ code: 'network', status: 0 });
  });

  it('reports a failing sign-in token as not authenticated, without calling the server', async () => {
    const { fetch, calls } = fakeFetch();
    const getAccessToken = async () => {
      throw new Error('refresh token revoked');
    };

    const error = await failure(client(fetch, { getAccessToken }).api.getProfile());

    expect(error.code).toBe('not_authenticated');
    expect(calls).toHaveLength(0);
  });

  it('waits and asks again while the backend wakes up', async () => {
    const wakingUp = () =>
      json(503, { error: { code: 'waking_up', field: null } }, { 'retry-after': '5' });
    const { fetch, calls } = fakeFetch(wakingUp(), wakingUp(), json(200, PROFILE));
    const { api, sleeps } = client(fetch);

    expect(await api.getProfile()).toEqual(PROFILE);
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([5000, 5000]);
  });

  it('gives up when the backend stays asleep', async () => {
    const answers = Array.from({ length: 5 }, () =>
      json(503, { error: { code: 'waking_up', field: null } }, { 'retry-after': '5' }),
    );
    const { fetch, calls } = fakeFetch(...answers);

    const error = await failure(client(fetch).api.getProfile());

    expect(error).toMatchObject({ code: 'waking_up', status: 503 });
    expect(calls).toHaveLength(5);
  });

  it('says so when no API address is configured', async () => {
    const { fetch, calls } = fakeFetch();

    const error = await failure(client(fetch, { baseUrl: '' }).api.getProfile());

    expect(error.code).toBe('not_configured');
    expect(calls).toHaveLength(0);
  });
});
