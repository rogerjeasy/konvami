import { ApiError } from '@konvami/api-client';
import type {
  ApiClient,
  Chain,
  ChainProfile,
  ChainStory,
  HalvesQueueItem,
} from '@konvami/api-client';

type ChainMethods = Pick<
  ApiClient,
  | 'getChain'
  | 'joinChain'
  | 'changeChain'
  | 'rerollChainCodename'
  | 'leaveChain'
  | 'removeChainBlock'
  | 'startChainStory'
  | 'redeemChainInvite'
  | 'getChainStory'
  | 'createChainInvite'
  | 'fillChainSeats'
  | 'sendChainLine'
  | 'reactToChainStory'
  | 'leaveChainStory'
  | 'blockChainPlayer'
  | 'getChainOpeningAudio'
  | 'getChainPlayAudio'
  | 'getChainLineAudio'
  | 'reportChainLine'
  | 'retryChainLine'
  | 'saveChainCard'
  | 'getChainQueue'
  | 'decideChainItem'
>;

export interface FakeChainControls {
  /** Opens the story chain to the learner (closed by default, as on a server without it). */
  chainOpen(open?: boolean): void;
  /** Ends a story: the radio play is ready. */
  chainFinish(id: string): void;
}

/** The friend's code `redeemChainInvite` accepts. */
export const FAKE_CHAIN_CODE = 'STORY23456';
const LINES = 8;
const OPENING =
  'Es ist Mitternacht im Zug nach Wien. Plötzlich geht das Licht aus, und als es wieder angeht, ist ein roter Koffer verschwunden.';

/** A story with three AI characters as it opens: the learner's turn, the opening before them. */
export function fakeChainStory(id: string, overrides: Partial<ChainStory> = {}): ChainStory {
  return {
    id,
    openingId: 'night-train',
    genre: 'mystery',
    title: 'The Night Train',
    language: 'de',
    mode: 'solo',
    status: 'open',
    mySeat: 1,
    host: true,
    position: 1,
    turnSeat: 1,
    myTurn: true,
    seats: [
      { seat: 1, name: 'Linde-7', ai: false, me: true, state: 'playing', lines: 0 },
      { seat: 2, name: 'Lena', ai: true, me: false, state: 'playing', lines: 0 },
      { seat: 3, name: 'Max', ai: true, me: false, state: 'playing', lines: 0 },
      { seat: 4, name: 'Pia', ai: true, me: false, state: 'playing', lines: 0 },
    ],
    before: {
      kind: 'narrator',
      id: null,
      name: '',
      ai: true,
      text: OPENING,
      recap: null,
      hidden: false,
      hasAudio: true,
    },
    mine: [],
    play: [],
    playStatus: 'none',
    reactions: { laughed: 0, surprised: 0, loved: 0, encore: 0 },
    myReaction: null,
    veilDefault: true,
    inviteCode: null,
    inviteExpiresAt: null,
    canFill: false,
    lines: LINES,
    ...overrides,
  };
}

/**
 * The story chain on a fake server: enough of the rules for the screens' tests (a story with AI
 * characters, a line sent and the AI going on at once, the radio play, codes and settings).
 */
export function createFakeChain(
  record: (method: keyof ApiClient, ...args: unknown[]) => Promise<void>,
): ChainMethods & FakeChainControls {
  let open = false;
  let profile: ChainProfile | null = null;
  const stories = new Map<string, ChainStory>();
  const queue: HalvesQueueItem[] = [];
  let made = 0;

  const hub = (): Chain => ({
    available: open,
    profile,
    stories: [...stories.values()].map((story) => ({
      id: story.id,
      openingId: story.openingId,
      genre: story.genre,
      title: story.title,
      mode: story.mode,
      status: story.status,
      next:
        story.status === 'done'
          ? story.myReaction
            ? 'done'
            : 'listen'
          : story.myTurn
            ? 'record'
            : 'wait',
      position: story.position,
      seats: story.seats,
      createdAt: '2026-11-20T12:00:00Z',
    })),
    openings: [
      { id: 'night-train', genre: 'mystery', title: 'The Night Train' },
      { id: 'wrong-cake', genre: 'comedy', title: 'The Wrong Cake' },
    ],
    duos: [],
    blocks: [],
    lines: LINES,
    lineSeconds: 45,
  });
  const joined = () => {
    if (!open) throw new ApiError('unavailable', 403);
    if (!profile) throw new ApiError('not_joined', 409);
    return profile;
  };
  const storyOf = (id: string) => {
    const found = stories.get(id);
    if (!found) throw new ApiError('not_found', 404);
    return found;
  };
  const save = (story: ChainStory) => {
    stories.set(story.id, story);
    return story;
  };

  return {
    chainOpen(value = true) {
      open = value;
    },
    chainFinish(id) {
      const story = storyOf(id);
      save({
        ...story,
        status: 'done',
        myTurn: false,
        turnSeat: null,
        position: LINES,
        playStatus: 'ready',
        before: null,
        seats: story.seats.map((seat) => ({ ...seat, lines: 2 })),
        play: [
          {
            index: 0,
            kind: 'narrator',
            name: '',
            ai: true,
            mine: false,
            text: OPENING,
            position: 0,
            lineId: null,
            hasAudio: true,
            hidden: false,
          },
          {
            index: 1,
            kind: 'line',
            name: 'Linde-7',
            ai: false,
            mine: true,
            text: 'Ich sehe einen Mann mit einem Hut.',
            position: 1,
            lineId: 'line-1',
            hasAudio: true,
            hidden: false,
          },
          {
            index: 2,
            kind: 'line',
            name: 'Lena',
            ai: true,
            mine: false,
            text: 'Der Mann lacht und verschwindet im Nebel.',
            position: 2,
            lineId: 'line-2',
            hasAudio: true,
            hidden: false,
          },
          {
            index: 3,
            kind: 'narrator',
            name: '',
            ai: true,
            mine: false,
            text: 'Am Morgen kam der Zug in Wien an.',
            position: 2,
            lineId: null,
            hasAudio: false,
            hidden: false,
          },
        ],
      });
    },
    async getChain() {
      await record('getChain');
      return hub();
    },
    async joinChain(answers) {
      await record('joinChain', answers);
      if (!open) throw new ApiError('unavailable', 403);
      if (!answers.voiceConsent) throw new ApiError('consent_required', 403);
      profile = {
        codename: 'Linde-7',
        band: 'adult',
        veilDefault: answers.veilDefault ?? true,
        paused: false,
        strikes: 0,
        suspended: false,
      };
      return hub();
    },
    async changeChain(changes) {
      await record('changeChain', changes);
      const current = joined();
      profile = {
        ...current,
        veilDefault: changes.veilDefault ?? current.veilDefault,
        paused: changes.paused ?? current.paused,
      };
      return hub();
    },
    async rerollChainCodename() {
      await record('rerollChainCodename');
      profile = { ...joined(), codename: 'Vega-12' };
      return hub();
    },
    async leaveChain() {
      await record('leaveChain');
      profile = null;
    },
    async removeChainBlock(blockId) {
      await record('removeChainBlock', blockId);
    },
    async startChainStory(start) {
      await record('startChainStory', start);
      joined();
      made += 1;
      const friends = start.seats.some((seat) => seat.kind !== 'ai');
      const story = fakeChainStory(`story-${made}`, {
        mode: friends ? 'friends' : 'solo',
        inviteCode: start.seats.some((seat) => seat.kind === 'friend') ? FAKE_CHAIN_CODE : null,
        inviteExpiresAt: '2026-11-27T12:00:00Z',
        canFill: friends,
      });
      return save(story);
    },
    async redeemChainInvite(code) {
      await record('redeemChainInvite', code);
      joined();
      if (code.toUpperCase() !== FAKE_CHAIN_CODE) throw new ApiError('not_found', 404);
      made += 1;
      return save(
        fakeChainStory(`story-${made}`, { mySeat: 2, myTurn: false, turnSeat: 1, host: false }),
      );
    },
    async getChainStory(id) {
      await record('getChainStory', id);
      joined();
      return storyOf(id);
    },
    async createChainInvite(id) {
      await record('createChainInvite', id);
      return save({ ...storyOf(id), inviteCode: FAKE_CHAIN_CODE });
    },
    async fillChainSeats(id) {
      await record('fillChainSeats', id);
      const story = storyOf(id);
      return save({ ...story, canFill: false, inviteCode: null });
    },
    async sendChainLine(id, line) {
      await record('sendChainLine', id, line);
      const story = storyOf(id);
      if (!story.myTurn) throw new ApiError('not_your_turn', 409);
      const sent = {
        id: `line-${story.position}`,
        position: story.position,
        status: 'delivered' as const,
        transcript: 'Ich sehe einen Mann mit ein Hut.',
      };
      // The AI characters say lines 2 to 4 at once, and it is the learner's turn again.
      save({
        ...story,
        position: story.position + 4,
        before: {
          kind: 'line',
          id: `line-${story.position + 3}`,
          name: 'Pia',
          ai: true,
          text: 'Plötzlich klingelte ein Telefon im Koffer.',
          recap: 'Ein Mann mit Hut sucht den roten Koffer.',
          hidden: false,
          hasAudio: true,
        },
        seats: story.seats.map((seat) => ({ ...seat, lines: seat.lines + 1 })),
        mine: [
          ...story.mine,
          {
            ...sent,
            reasons: [],
            veiled: line.veiled ?? true,
            before: story.before,
            corrections: [
              {
                original: 'mit ein Hut',
                corrected: 'mit einem Hut',
                explanation: '„mit“ takes the dative: einem.',
                certain: true,
              },
            ],
          },
        ],
      });
      return sent;
    },
    async reactToChainStory(id, reaction) {
      await record('reactToChainStory', id, reaction);
      const story = storyOf(id);
      return save({
        ...story,
        myReaction: reaction,
        reactions: { ...story.reactions, [reaction]: (story.reactions[reaction] ?? 0) + 1 },
      });
    },
    async leaveChainStory(id) {
      await record('leaveChainStory', id);
      const story = storyOf(id);
      return save({
        ...story,
        myTurn: false,
        seats: story.seats.map((seat) =>
          seat.me ? { ...seat, ai: true, name: 'Lena', state: 'taken_over' } : seat,
        ),
      });
    },
    async blockChainPlayer(id, seat) {
      await record('blockChainPlayer', id, seat);
      const story = storyOf(id);
      return save({
        ...story,
        seats: story.seats.map((one) => (one.seat === seat ? { ...one, ai: true } : one)),
      });
    },
    async getChainOpeningAudio(id) {
      await record('getChainOpeningAudio', id);
      return { url: `https://files.test/chain/${id}/opening.mp3` };
    },
    async getChainPlayAudio(id, index) {
      await record('getChainPlayAudio', id, index);
      return { url: `https://files.test/chain/${id}/${index}.mp3` };
    },
    async getChainLineAudio(lineId) {
      await record('getChainLineAudio', lineId);
      return { url: `https://files.test/chain/lines/${lineId}.mp3` };
    },
    async reportChainLine(lineId, report) {
      await record('reportChainLine', lineId, report);
      const story = [...stories.values()].find((one) => one.before?.id === lineId);
      if (!story?.before) throw new ApiError('not_found', 404);
      return save({ ...story, before: { ...story.before, hidden: true, text: '' } });
    },
    async retryChainLine(lineId, index, attempt) {
      await record('retryChainLine', lineId, index, attempt);
      return {
        heard: 'Ich sehe einen Mann mit einem Hut.',
        right: true,
        original: 'mit ein Hut',
        corrected: 'mit einem Hut',
      };
    },
    async saveChainCard(lineId, index) {
      await record('saveChainCard', lineId, index);
      return { id: `card-${lineId}-${index}` };
    },
    async getChainQueue() {
      await record('getChainQueue');
      return { items: queue };
    },
    async decideChainItem(kind, id, action) {
      await record('decideChainItem', kind, id, action);
    },
  };
}
