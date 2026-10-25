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

  it('reads the account, sends a photo in two steps and removes it', async () => {
    const upload = {
      uploadId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      url: 'https://files.example.test/',
      fields: { key: 'uploads/u/a.jpg', 'Content-Type': 'image/jpeg' },
    };
    const withPicture = { picture: { url: 'https://files.example.test/users/u/a.jpg?sig=1' } };
    const { fetch, calls } = fakeFetch(
      json(200, { picture: null }),
      json(200, upload),
      json(200, withPicture),
      json(200, { picture: null }),
    );
    const { api } = client(fetch);

    expect(await api.getAccount()).toEqual({ picture: null });
    expect(await api.startPictureUpload()).toEqual(upload);
    expect(await api.confirmPicture(upload.uploadId)).toEqual(withPicture);
    expect(await api.removePicture()).toEqual({ picture: null });

    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      'GET /v1/account',
      'POST /v1/account/picture/upload',
      'POST /v1/account/picture',
      'DELETE /v1/account/picture',
    ]);
    expect(calls[2]?.body).toEqual({ uploadId: upload.uploadId });
  });

  it('deletes the account', async () => {
    const { fetch, calls } = fakeFetch(json(200, { deleted: true }));

    await expect(client(fetch).api.deleteAccount()).resolves.toBeUndefined();

    expect(calls[0]).toMatchObject({
      url: 'https://api.example.test/v1/account',
      method: 'DELETE',
    });
  });

  it('creates, drafts, copies partners and reads the templates', async () => {
    const draft = {
      role: 'teacher',
      name: 'Greta',
      gender: 'female',
      age: 30,
      origin: 'Hamburg',
      occupation: 'Marketing-Managerin',
      tagline: null,
      backstory: 'Greta segelt jedes Wochenende.',
      look: {
        skin: 'honey',
        hair: 'bob',
        hairColor: 'auburn',
        top: 'amber',
        backdrop: 'sand',
        glasses: true,
        beard: false,
      },
      voice: 'coral',
      personality: {
        warmth: 5,
        playfulness: 2,
        talkativeness: 4,
        curiosity: 3,
        humour: 1,
        formOfAddress: 'formal',
        style: 'stories',
      },
      teaching: {
        correctionTiming: 'immediate',
        strictness: 'everything',
        explanationUsage: null,
        level: 'B1',
        focus: 'Dativ',
        speed: 0.9,
      },
    } as const;
    const greta = { id: '9d1c2f0e-6c1b-4a8e-9a55-0d2f6a1c9e55', ...draft };
    const { fetch, calls } = fakeFetch(
      json(200, draft),
      json(200, { templates: [draft] }),
      json(200, greta),
      json(200, { ...greta, id: 'copy', name: 'Greta 2' }),
    );
    const { api } = client(fetch);

    expect(await api.draftPersona('A friendly woman from Hamburg')).toEqual(draft);
    expect(await api.getPersonaTemplates()).toEqual([draft]);
    expect(await api.createPersona(draft)).toEqual(greta);
    expect((await api.duplicatePersona(greta.id)).name).toBe('Greta 2');

    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      'POST /v1/personas/draft',
      'GET /v1/personas/templates',
      'POST /v1/personas',
      `POST /v1/personas/${greta.id}/duplicate`,
    ]);
    expect(calls[0]?.body).toEqual({ description: 'A friendly woman from Hamburg' });
    expect(calls[2]?.body).toEqual(draft);
  });

  it('reads the address of a voice’s sample', async () => {
    const { fetch, calls } = fakeFetch(json(200, { url: 'https://files.example.test/coral.mp3' }));

    expect(await client(fetch).api.getVoiceSample('coral')).toBe(
      'https://files.example.test/coral.mp3',
    );

    expect(new URL(calls[0]!.url).pathname).toBe('/v1/voices/coral/sample');
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
    [429, 'minutes_used_up'],
    [503, 'voice_paused'],
    [503, 'voice_unavailable'],
  ])('passes on why a voice call was refused (%i)', async (status, code) => {
    const { fetch, calls } = fakeFetch(json(status, { error: { code, field: null } }));

    const error = await failure(client(fetch).api.startVoiceCall('onboarding', 'v=0 offer'));

    expect(error).toMatchObject({ code, status });
    expect(calls).toHaveLength(1);
  });

  it('starts a practice call with the chosen partner and the learner’s own date', async () => {
    const answer = { callId: 'rtc_2', sdp: 'v=0 answer', maxSeconds: 600 };
    const { fetch, calls } = fakeFetch(json(200, answer));

    const started = await client(fetch).api.startVoiceCall('practice', 'v=0 offer', {
      personaId: 'persona-1',
      localDate: '2026-10-10',
    });

    expect(started).toEqual(answer);
    expect(calls[0]?.body).toEqual({
      purpose: 'practice',
      sdp: 'v=0 offer',
      personaId: 'persona-1',
      localDate: '2026-10-10',
    });
  });

  it('starts a role-play with the chosen partner', async () => {
    const answer = { callId: 'rtc_3', sdp: 'v=0 answer', maxSeconds: 600 };
    const { fetch, calls } = fakeFetch(json(200, answer));

    await client(fetch).api.startVoiceCall('practice', 'v=0 offer', {
      personaId: 'persona-1',
      scenario: 'bakery',
    });

    expect(calls[0]?.body).toEqual({
      purpose: 'practice',
      sdp: 'v=0 offer',
      personaId: 'persona-1',
      scenario: 'bakery',
    });
  });

  it('reads home for the device’s time zone', async () => {
    const home = { language: 'de', partners: [], recent: [] };
    const { fetch, calls } = fakeFetch(json(200, home), json(200, home));
    const { api } = client(fetch);

    expect(await api.getHome('Europe/Zurich')).toEqual(home);
    await api.getHome();

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET https://api.example.test/v1/home?tz=Europe%2FZurich',
      'GET https://api.example.test/v1/home',
    ]);
  });

  it('reads progress for the device’s time zone', async () => {
    const progress = { language: 'de', weeks: [], milestones: [] };
    const { fetch, calls } = fakeFetch(json(200, progress), json(200, progress));
    const { api } = client(fetch);

    expect(await api.getProgress('Europe/Zurich')).toEqual(progress);
    await api.getProgress();

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET https://api.example.test/v1/progress?tz=Europe%2FZurich',
      'GET https://api.example.test/v1/progress',
    ]);
  });

  it('asks for, follows and plays last week’s check-in', async () => {
    const review = { status: 'pending', text: null, numbers: { week: '2026-10-05' } };
    const { fetch, calls } = fakeFetch(
      json(200, review),
      json(200, review),
      json(200, { url: 'https://files/week.mp3' }),
    );
    const { api } = client(fetch);

    expect(await api.requestWeekReview('2026-10-05', 'Europe/Zurich')).toEqual(review);
    expect(await api.getWeekReview('2026-10-05')).toEqual(review);
    expect(await api.getWeekReviewAudio('2026-10-05')).toEqual({ url: 'https://files/week.mp3' });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST https://api.example.test/v1/weeks/2026-10-05/review?tz=Europe%2FZurich',
      'GET https://api.example.test/v1/weeks/2026-10-05/review',
      'GET https://api.example.test/v1/weeks/2026-10-05/review/audio',
    ]);
  });

  it('reads the exam centre, prepares a simulation and reads its score', async () => {
    const { fetch, calls } = fakeFetch(
      json(200, { formats: [] }),
      json(200, { cards: [] }),
      json(200, { status: 'pending' }),
      json(200, { status: 'pending' }),
      json(200, { url: 'https://files/model.mp3' }),
    );
    const { api } = client(fetch);

    await api.getExamCentre();
    await api.getNextSimulation('goethe_b1');
    await api.getSimulation('rtc/1');
    await api.rescoreSimulation('rtc/1');
    expect(await api.getModelAnswerAudio('rtc/1', 'teil_1')).toEqual({
      url: 'https://files/model.mp3',
    });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET https://api.example.test/v1/exams',
      'GET https://api.example.test/v1/exams/goethe_b1/next',
      'GET https://api.example.test/v1/exams/simulations/rtc%2F1',
      'POST https://api.example.test/v1/exams/simulations/rtc%2F1/score',
      'GET https://api.example.test/v1/exams/simulations/rtc%2F1/parts/teil_1/audio',
    ]);
  });

  it('reads the library page by page and one transcript', async () => {
    const page = { conversations: [], next: '2026-10-09T10:00:00Z' };
    const transcript = { conversation: { id: 'rtc/1' }, turns: [] };
    const { fetch, calls } = fakeFetch(json(200, page), json(200, page), json(200, transcript));
    const { api } = client(fetch);

    expect(await api.getConversations()).toEqual(page);
    await api.getConversations({ before: '2026-10-09T10:00:00Z', limit: 10 });
    expect(await api.getConversation('rtc/1')).toEqual(transcript);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET https://api.example.test/v1/conversations',
      'GET https://api.example.test/v1/conversations?before=2026-10-09T10%3A00%3A00Z&limit=10',
      'GET https://api.example.test/v1/conversations/rtc%2F1',
    ]);
  });

  it('reads a conversation’s report, and asks for one', async () => {
    const pending = { status: 'pending', report: null };
    const { fetch, calls } = fakeFetch(
      json(200, { status: 'none', report: null }),
      json(200, pending),
    );
    const { api } = client(fetch);

    expect(await api.getConversationReport('rtc/1')).toEqual({ status: 'none', report: null });
    expect(await api.requestConversationReport('rtc/1')).toEqual(pending);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET https://api.example.test/v1/conversations/rtc%2F1/report',
      'POST https://api.example.test/v1/conversations/rtc%2F1/report',
    ]);
  });

  it('saves, lists, reviews and removes flashcards', async () => {
    const card = { id: 'card/1', front: 'das Wochenende' };
    const deck = { cards: [card], next: null, total: 1, due: 1 };
    const { fetch, calls } = fakeFetch(
      json(200, card),
      json(200, deck),
      json(200, deck),
      json(200, { cards: [], due: 0 }),
      json(200, { cards: [], due: 0 }),
      json(200, card),
      json(200, { total: 0, due: 0 }),
    );
    const { api } = client(fetch);

    expect(await api.saveCard({ conversationId: 'rtc_1', kind: 'word', index: 2 })).toEqual(card);
    expect(await api.getCards()).toEqual(deck);
    await api.getCards({ before: '2026-10-09T10:00:00Z', limit: 10 });
    expect(await api.getDueCards()).toEqual({ cards: [], due: 0 });
    await api.getDueCards(5);
    expect(await api.reviewCard('card/1', 'good')).toEqual(card);
    expect(await api.removeCard('card/1')).toEqual({ total: 0, due: 0 });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST https://api.example.test/v1/cards',
      'GET https://api.example.test/v1/cards',
      'GET https://api.example.test/v1/cards?before=2026-10-09T10%3A00%3A00Z&limit=10',
      'GET https://api.example.test/v1/cards/due',
      'GET https://api.example.test/v1/cards/due?limit=5',
      'POST https://api.example.test/v1/cards/card%2F1/review',
      'DELETE https://api.example.test/v1/cards/card%2F1',
    ]);
    expect(calls[0]?.body).toEqual({ conversationId: 'rtc_1', kind: 'word', index: 2 });
    expect(calls[5]?.body).toEqual({ rating: 'good' });
  });

  it('asks the tutor, about a correction too, and reads the questions asked', async () => {
    const question = {
      id: 'q1',
      askedAt: '2026-10-09T12:00:00Z',
      question: 'Why dem?',
      answer: {
        explanation: 'Dative after mit.',
        examples: [],
        topic: 'case_dative',
        unsure: false,
      },
      source: 'text',
    };
    const { fetch, calls } = fakeFetch(
      json(200, question),
      json(200, { ...question, source: 'report' }),
      json(200, { questions: [question] }),
    );
    const { api } = client(fetch);

    expect(await api.askTutor('Why dem?')).toEqual(question);
    expect((await api.explainCorrection('rtc/1', 2)).source).toBe('report');
    expect((await api.getTutorQuestions()).questions).toEqual([question]);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST https://api.example.test/v1/tutor/questions',
      'POST https://api.example.test/v1/tutor/corrections',
      'GET https://api.example.test/v1/tutor/questions',
    ]);
    expect(calls[0]?.body).toEqual({ question: 'Why dem?' });
    expect(calls[1]?.body).toEqual({ conversationId: 'rtc/1', index: 2 });
  });

  it('reads the grammar map and one of its topics', async () => {
    const map = { language: 'de', level: 'A2', topics: [] };
    const page = { topic: { id: 'dative' }, examples: [], typicalMistakes: [], mistakes: [] };
    const { fetch, calls } = fakeFetch(json(200, map), json(200, page));
    const { api } = client(fetch);

    expect(await api.getGrammarMap()).toEqual(map);
    expect(await api.getGrammarTopic('two way/x')).toEqual(page);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET https://api.example.test/v1/grammar',
      'GET https://api.example.test/v1/grammar/two%20way%2Fx',
    ]);
  });

  it('starts a practice call that practises a grammar topic', async () => {
    const answer = { callId: 'rtc_3', sdp: 'v=0 answer', maxSeconds: 600, plan: null };
    const { fetch, calls } = fakeFetch(json(200, answer));

    await client(fetch).api.startVoiceCall('practice', 'v=0 offer', {
      personaId: 'persona-1',
      practise: 'dative',
    });

    expect(calls[0]?.body).toEqual({
      purpose: 'practice',
      sdp: 'v=0 offer',
      personaId: 'persona-1',
      practise: 'dative',
    });
  });

  it('answers a card out loud', async () => {
    const answered = {
      heard: 'Termin',
      outcome: 'article',
      expected: 'der Termin',
      suggested: 'hard',
    };
    const { fetch, calls } = fakeFetch(json(200, answered));
    const { api } = client(fetch);

    expect(await api.answerCard('c/1', { audio: 'AAEC', format: 'webm', durationMs: 900 })).toEqual(
      answered,
    );

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('https://api.example.test/v1/cards/c%2F1/answers');
    expect(calls[0]?.body).toEqual({ audio: 'AAEC', format: 'webm', durationMs: 900 });
  });

  it('says a correction again and reads which were said again', async () => {
    const retried = { heard: 'Ich bin gefahren.', right: true, said: 'habe', better: 'bin' };
    const { fetch, calls } = fakeFetch(
      json(200, retried),
      json(200, { retries: [{ index: 0, right: true }] }),
    );
    const { api } = client(fetch);

    expect(
      await api.retryCorrection('rtc/1', 0, { audio: 'AAEC', format: 'm4a', durationMs: 2400 }),
    ).toEqual(retried);
    expect(await api.getRetries('rtc/1')).toEqual({ retries: [{ index: 0, right: true }] });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST https://api.example.test/v1/conversations/rtc%2F1/report/mistakes/0/retries',
      'GET https://api.example.test/v1/conversations/rtc%2F1/retries',
    ]);
    expect(calls[0]?.body).toEqual({ audio: 'AAEC', format: 'm4a', durationMs: 2400 });
  });

  it('reads where a card’s sound plays from', async () => {
    const { fetch, calls } = fakeFetch(json(200, { url: 'https://files/card.mp3' }));

    expect(await client(fetch).api.getCardAudio('card/1')).toEqual({
      url: 'https://files/card.mp3',
    });
    expect(calls[0]?.url).toBe('https://api.example.test/v1/cards/card%2F1/audio');
  });

  it('reads and sets whether recordings are kept', async () => {
    const { fetch, calls } = fakeFetch(json(200, { kept: true }), json(200, { kept: false }));
    const { api } = client(fetch);

    expect(await api.getRecordings()).toEqual({ kept: true });
    expect(await api.configureRecordings(false)).toEqual({ kept: false });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET https://api.example.test/v1/recordings',
      'PATCH https://api.example.test/v1/recordings',
    ]);
    expect(calls[1]?.body).toEqual({ kept: false });
  });

  it('reads the voice minutes and, for the owner, the costs of a month', async () => {
    const allowance = {
      weeklySeconds: 3600,
      usedSeconds: 600,
      remainingSeconds: 3000,
      resetsAt: '2026-10-26T00:00:00Z',
    };
    const { fetch, calls } = fakeFetch(
      json(200, allowance),
      json(403, { error: { code: 'not_owner', field: null } }),
    );
    const { api } = client(fetch);

    expect(await api.getVoiceAllowance()).toEqual(allowance);
    await expect(api.getCosts('2026-09-01')).rejects.toMatchObject({ code: 'not_owner' });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET https://api.example.test/v1/voice/allowance',
      'GET https://api.example.test/v1/owner/costs?month=2026-09-01',
    ]);
  });

  it('reads, sets, changes and forgets what partners know', async () => {
    const memory = { id: 'mem/1', kind: 'event', text: 'Has a job interview.', day: '2026-10-16' };
    const book = { enabled: true, avoidTopics: [], memories: [memory] };
    const { fetch, calls } = fakeFetch(
      json(200, book),
      json(200, { ...book, enabled: false }),
      json(200, { ...book, avoidTopics: ['politics'] }),
      json(200, memory),
      json(200, memory),
      json(200, { ...book, memories: [] }),
    );
    const { api } = client(fetch);

    expect(await api.getMemories()).toEqual(book);
    expect((await api.configureMemories({ enabled: false })).enabled).toBe(false);
    await api.configureMemories({ avoidTopics: ['politics'] });
    expect(await api.changeMemory('mem/1', { text: 'Interview at Planzer.' })).toEqual(memory);
    await api.changeMemory('mem/1', { day: null });
    expect((await api.removeMemory('mem/1')).memories).toEqual([]);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET https://api.example.test/v1/memories',
      'PATCH https://api.example.test/v1/memories',
      'PATCH https://api.example.test/v1/memories',
      'PATCH https://api.example.test/v1/memories/mem%2F1',
      'PATCH https://api.example.test/v1/memories/mem%2F1',
      'DELETE https://api.example.test/v1/memories/mem%2F1',
    ]);
    expect(calls[1]?.body).toEqual({ enabled: false });
    expect(calls[2]?.body).toEqual({ avoidTopics: ['politics'] });
    expect(calls[3]?.body).toEqual({ text: 'Interview at Planzer.' });
    // Taking the day away is a change: the null is sent.
    expect(calls[4]?.body).toEqual({ day: null });
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
