import { ApiError } from '@konvami/api-client';
import type {
  ApiClient,
  Card,
  Radio,
  RadioCall,
  RadioEpisode,
  RadioEpisodeCard,
  RadioProfile,
  RadioQueueItem,
  RadioSegment,
} from '@konvami/api-client';

type RadioMethods = Pick<
  ApiClient,
  | 'getRadio'
  | 'joinRadio'
  | 'changeRadio'
  | 'rerollRadioCodename'
  | 'leaveRadio'
  | 'getRadioArchive'
  | 'getRadioEpisode'
  | 'getRadioSegmentAudio'
  | 'applaudRadioSegment'
  | 'reportRadioSegment'
  | 'sendRadioCall'
  | 'getRadioCall'
  | 'getRadioCallAudio'
  | 'withdrawRadioCall'
  | 'sayRadioCorrectionBetter'
  | 'saveRadioCorrectionCard'
  | 'getRadioQueue'
  | 'decideRadioItem'
  | 'pullRadioEpisode'
>;

export interface FakeRadioControls {
  /** Opens Radio Konvami to the learner (closed by default, as on a server without it). */
  radioOpen(open?: boolean): void;
  /** Whether the learner is an adult (asked for the consent) or under 18. */
  radioMinor(minor?: boolean): void;
  /** Puts an item in the owner's queue. */
  radioQueued(item: RadioQueueItem): void;
  /** Has the learner's latest call aired in today's show. */
  radioAired(): void;
}

export const FAKE_SHOW_ID = 'show-1';
export const FAKE_QUESTION = 'Was war deine lustigste Zugfahrt?';
const AIRS_AT = '2026-11-20T17:00:00Z';
const DAY = '2026-11-20';
const NO_APPLAUSE = { bravo: 0, ha_ha: 0, me_too: 0, wow: 0 };

function segment(index: number, changes: Partial<RadioSegment>): RadioSegment {
  return {
    index,
    kind: 'host',
    speaker: 'Mia',
    ai: true,
    text: '',
    playable: true,
    mine: false,
    applause: { ...NO_APPLAUSE },
    myApplause: null,
    hidden: false,
    ...changes,
  };
}

/** Today's show as the fake server builds it: Mia, two AI callers, and her lines between. */
export function fakeShow(): RadioEpisode {
  return {
    id: FAKE_SHOW_ID,
    day: DAY,
    language: 'de',
    question: FAKE_QUESTION,
    questionHelp: 'What was your funniest train journey?',
    host: 'Mia',
    airsAt: AIRS_AT,
    segments: [
      segment(0, {
        text: `Hallo und willkommen bei Radio Konvami! Heute fragen wir: ${FAKE_QUESTION}`,
      }),
      segment(1, {
        kind: 'ai_call',
        speaker: 'Klara',
        text: 'Einmal bin ich im Zug eingeschlafen und in Basel aufgewacht.',
      }),
      segment(2, { text: 'Danke, Klara! Das gefällt mir sehr.' }),
      segment(3, {
        kind: 'ai_call',
        speaker: 'Jonas',
        text: 'Ein Hund hat die ganze Fahrt mein Brot angeschaut.',
        playable: false,
      }),
      segment(4, { text: 'Das war Radio Konvami für heute. Ruf an!' }),
    ],
  };
}

export function createFakeRadio(
  record: (method: keyof ApiClient, ...args: unknown[]) => Promise<void>,
): RadioMethods & FakeRadioControls {
  let open = false;
  let minor = false;
  let profile: RadioProfile | null = null;
  let show = fakeShow();
  let queue: RadioQueueItem[] = [];
  const calls = new Map<string, RadioCall>();
  let made = 0;

  const card = (): RadioEpisodeCard => ({
    id: show.id,
    day: show.day,
    question: show.question,
    host: show.host,
    callers: show.segments.filter((s) => s.kind === 'call').length,
    aiCallers: show.segments.filter((s) => s.kind === 'ai_call').length,
    mine: show.segments.some((s) => s.mine),
    airsAt: show.airsAt,
  });

  const hub = (): Radio => {
    const mine = [...calls.values()].reverse();
    const aired = mine.some((call) => call.status === 'aired');
    return {
      available: open,
      profile,
      language: 'de',
      onAir: open ? card() : null,
      warmingUp: false,
      nextShow: open
        ? {
            episodeId: 'show-2',
            day: '2026-11-21',
            airsAt: '2026-11-21T17:00:00Z',
            question: 'Was isst du am liebsten zum Frühstück?',
            questionHelp: 'What do you like best for breakfast?',
            myCall: mine.find((call) => call.episodeId === 'show-2') ?? null,
          }
        : null,
      aired: aired ? card() : null,
      calls: mine,
      strikes: 0,
      suspended: false,
      callSeconds: 45,
    };
  };

  const call = (id: string) => {
    const found = calls.get(id);
    if (!found) throw new ApiError('not_found', 404);
    return found;
  };

  return {
    radioOpen: (value = true) => {
      open = value;
    },
    radioMinor: (value = true) => {
      minor = value;
    },
    radioQueued: (item) => {
      queue = [...queue, item];
    },
    radioAired: () => {
      const latest = [...calls.values()].pop();
      if (!latest) return;
      calls.set(latest.id, { ...latest, status: 'aired', episodeId: show.id });
      show = {
        ...show,
        segments: [
          ...show.segments.slice(0, 1),
          segment(5, {
            kind: 'call',
            speaker: profile?.codename ?? '',
            ai: false,
            text: latest.transcript,
            mine: true,
          }),
          ...show.segments.slice(1),
        ],
      };
    },
    getRadio: async () => {
      await record('getRadio');
      return hub();
    },
    joinRadio: async (answers) => {
      await record('joinRadio', answers);
      if (!minor && !answers.voiceConsent) throw new ApiError('consent_required', 403);
      profile = {
        codename: profile?.codename ?? 'Nova-7',
        band: minor ? 'minor' : 'adult',
        veilDefault: answers.veilDefault ?? true,
        agreed: !minor,
      };
      return hub();
    },
    changeRadio: async (changes) => {
      await record('changeRadio', changes);
      if (profile && typeof changes.veilDefault === 'boolean') {
        profile = { ...profile, veilDefault: changes.veilDefault };
      }
      return hub();
    },
    rerollRadioCodename: async () => {
      await record('rerollRadioCodename');
      if (profile) profile = { ...profile, codename: 'Vega-12' };
      return hub();
    },
    leaveRadio: async () => {
      await record('leaveRadio');
      profile = null;
      for (const [id, found] of calls) {
        calls.set(id, { ...found, status: 'removed', transcript: '', corrections: [] });
      }
    },
    getRadioArchive: async () => {
      await record('getRadioArchive');
      return { episodes: open ? [card()] : [] };
    },
    getRadioEpisode: async (id) => {
      await record('getRadioEpisode', id);
      if (id !== show.id) throw new ApiError('not_found', 404);
      return show;
    },
    getRadioSegmentAudio: async (id, index) => {
      await record('getRadioSegmentAudio', id, index);
      return { url: `https://files.test/radio/${id}/${index}.mp3` };
    },
    applaudRadioSegment: async (id, index, given) => {
      await record('applaudRadioSegment', id, index, given);
      show = {
        ...show,
        segments: show.segments.map((s) => {
          if (s.index !== index) return s;
          const applause = { ...s.applause };
          if (s.myApplause) applause[s.myApplause] = (applause[s.myApplause] ?? 1) - 1;
          if (given) applause[given] = (applause[given] ?? 0) + 1;
          return { ...s, applause, myApplause: given };
        }),
      };
      return show;
    },
    reportRadioSegment: async (id, index, report) => {
      await record('reportRadioSegment', id, index, report);
      show = {
        ...show,
        segments: show.segments.map((s) =>
          s.index === index ? { ...s, hidden: true, text: '', playable: false } : s,
        ),
      };
      return show;
    },
    sendRadioCall: async (input) => {
      await record('sendRadioCall', input);
      if (!profile) throw new ApiError('not_joined', 409);
      made += 1;
      const sent: RadioCall = {
        id: `call-${made}`,
        episodeId: 'show-2',
        day: '2026-11-21',
        question: 'Was isst du am liebsten zum Frühstück?',
        status: minor ? 'private' : 'ready',
        transcript: 'Ich esse gern Brötchen mit Honig.',
        reasons: [],
        veiled: input.veiled ?? profile.veilDefault,
        corrections: [
          {
            original: 'Ich esse gern Brötchen',
            corrected: 'Ich esse gern Brötchen mit Butter',
            explanation: 'A small detail makes it vivid.',
            certain: true,
          },
          {
            original: 'mit Honig',
            corrected: 'mit dem Honig',
            explanation: 'Perhaps the article.',
            certain: false,
          },
        ],
        airedAt: null,
        createdAt: '2026-11-20T12:00:00Z',
        playable: true,
      };
      calls.set(sent.id, sent);
      return sent;
    },
    getRadioCall: async (id) => {
      await record('getRadioCall', id);
      return call(id);
    },
    getRadioCallAudio: async (id) => {
      await record('getRadioCallAudio', id);
      return { url: `https://files.test/radio/calls/${id}.m4a` };
    },
    withdrawRadioCall: async (id) => {
      await record('withdrawRadioCall', id);
      const found = call(id);
      calls.set(id, { ...found, status: 'removed', transcript: '', corrections: [] });
    },
    sayRadioCorrectionBetter: async (id, index, recording) => {
      await record('sayRadioCorrectionBetter', id, index, recording);
      const correction = call(id).corrections[index];
      if (!correction) throw new ApiError('not_found', 404);
      return {
        heard: correction.corrected,
        right: true,
        original: correction.original,
        corrected: correction.corrected,
      };
    },
    saveRadioCorrectionCard: async (id, index) => {
      await record('saveRadioCorrectionCard', id, index);
      const correction = call(id).corrections[index];
      if (!correction) throw new ApiError('not_found', 404);
      return { id: `card-${id}-${index}`, front: correction.corrected } as unknown as Card;
    },
    getRadioQueue: async () => {
      await record('getRadioQueue');
      return { items: queue };
    },
    decideRadioItem: async (kind, id, action) => {
      await record('decideRadioItem', kind, id, action);
      queue = queue.filter((item) => item.id !== id);
    },
    pullRadioEpisode: async (id) => {
      await record('pullRadioEpisode', id);
      queue = queue.filter((item) => item.episodeId !== id);
    },
  };
}
