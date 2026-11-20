import { ApiError } from '@konvami/api-client';
import type {
  ApiClient,
  Halves,
  HalvesCase,
  HalvesProfile,
  HalvesQueueItem,
} from '@konvami/api-client';

type HalvesMethods = Pick<
  ApiClient,
  | 'getHalves'
  | 'joinHalves'
  | 'changeHalves'
  | 'rerollHalvesCodename'
  | 'leaveHalves'
  | 'startHalvesCase'
  | 'createHalvesInvite'
  | 'cancelHalvesInvite'
  | 'redeemHalvesInvite'
  | 'startHalvesDuoCase'
  | 'removeHalvesDuo'
  | 'removeHalvesBlock'
  | 'getHalvesCase'
  | 'sendHalvesMove'
  | 'solveHalvesCase'
  | 'playHalvesAgain'
  | 'handOverHalvesSeat'
  | 'blockHalvesPartner'
  | 'getHalvesRecapAudio'
  | 'getHalvesMoveAudio'
  | 'reactToHalvesMove'
  | 'answerHalvesMove'
  | 'reportHalvesMove'
  | 'getHalvesQueue'
  | 'decideHalvesItem'
>;

export interface FakeHalvesControls {
  /** Opens Two Halves to the learner (closed by default, as on a server without it). */
  halvesOpen(open?: boolean): void;
  /** Puts a held move in the owner's queue. */
  halvesHeld(item: HalvesQueueItem): void;
}

/** The friend's code `redeemHalvesInvite` accepts. */
export const FAKE_FRIEND_CODE = 'XYZ789';
// The board's right answer to the stand-in's first clue (Geneva).
const RIGHT = 1;

/** A case against the AI as it opens: round 1 to record, the stand-in's first clue waiting. */
export function fakeHalvesCase(id: string, overrides: Partial<HalvesCase> = {}): HalvesCase {
  const rounds = [1, 2, 3].map((round) => ({
    round,
    clue:
      round === 1 ? 'Ein Schaffner hat um 14:20 Uhr einen Cellokasten auf Gleis 4 gesehen.' : '',
    clueHelp: round === 1 ? 'A conductor saw a cello case on platform 4 at 14:20.' : '',
    mine: null,
    theirs:
      round === 1
        ? {
            id: `${id}-theirs-1`,
            hidden: false,
            question: 'Where did Inès change trains?',
            options: ['In Bern', 'In Geneva', 'In Basel'],
            answers: [],
            solution: null,
            reaction: null,
          }
        : null,
  }));
  return {
    id,
    templateId: 'lost_cello',
    title: 'The Lost Cello',
    setting: 'The cellist Inès travelled from Lyon to Zurich. Her cello is gone. Where is it?',
    mode: 'ai',
    status: 'open',
    seat: 'A',
    speaks: 'de',
    hears: 'fr',
    partner: { name: 'Julien', ai: true, place: null },
    rounds,
    final: {
      open: false,
      question: 'Where is the cello?',
      options: ['At Lyon lost property', 'On the train', 'In Geneva'],
      answers: [],
      otherAnswered: false,
      solution: null,
    },
    recordRound: 1,
    canHandOver: false,
    again: null,
    askAgain: false,
    recap: [],
    recapStatus: 'none',
    veilDefault: true,
    ending: null,
    ...overrides,
  };
}

/**
 * Two Halves on a fake server: enough of the rules for the screens' tests (a case against the
 * AI, a move sent for checking, the board's answer, reports, codes, settings).
 */
export function createFakeHalves(
  record: (method: keyof ApiClient, ...args: unknown[]) => Promise<void>,
): HalvesMethods & FakeHalvesControls {
  let open = false;
  let profile: HalvesProfile | null = null;
  let invite: Halves['invite'] = null;
  let blocks: Halves['blocks'] = [];
  let queue: HalvesQueueItem[] = [];
  const cases = new Map<string, HalvesCase>();
  let made = 0;

  const hub = (): Halves => ({
    available: open,
    profile,
    cases: [...cases.values()].map((found) => ({
      id: found.id,
      templateId: found.templateId,
      title: found.title,
      mode: found.mode,
      status: found.status,
      partner: found.partner,
      next: found.recordRound ? 'record' : 'wait',
      round: found.recordRound ?? 1,
      createdAt: '2026-11-20T12:00:00Z',
    })),
    seasonId: 'lost_cello',
    seasonTitle: 'The Lost Cello',
    seasonWeek: '2026-W47',
    duos: [],
    invite,
    blocks,
    cities: ['Lyon', 'Zürich'],
    countries: ['CH', 'FR'],
    nativeLanguages: ['de', 'en', 'fr', 'it', 'other'],
  });
  const joined = () => {
    if (!open) throw new ApiError('unavailable', 403);
    if (!profile) throw new ApiError('not_joined', 409);
    return profile;
  };
  const caseOf = (id: string) => {
    const found = cases.get(id);
    if (!found) throw new ApiError('not_found', 404);
    return found;
  };
  const withTheirs = (moveId: string, change: (found: HalvesCase) => HalvesCase) => {
    const found = [...cases.values()].find((c) => c.rounds.some((r) => r.theirs?.id === moveId));
    if (!found) throw new ApiError('not_found', 404);
    const changed = change(found);
    cases.set(found.id, changed);
    return changed;
  };
  const start = (overrides: Partial<HalvesCase> = {}) => {
    joined();
    made += 1;
    const found = fakeHalvesCase(`case-${made}`, overrides);
    cases.set(found.id, found);
    return found;
  };

  return {
    halvesOpen(value = true) {
      open = value;
    },
    halvesHeld(item) {
      queue = [...queue, item];
    },
    async getHalves() {
      await record('getHalves');
      return hub();
    },
    async joinHalves(answers) {
      await record('joinHalves', answers);
      if (!open) throw new ApiError('unavailable', 403);
      if (!answers.voiceConsent) throw new ApiError('consent_required', 403);
      profile = {
        codename: 'Linde-7',
        nativeLanguage: answers.nativeLanguage,
        place: answers.place ?? null,
        band: 'adult',
        veilDefault: answers.veilDefault ?? true,
        paused: false,
        strikes: 0,
        suspended: false,
      };
      return hub();
    },
    async changeHalves(changes) {
      await record('changeHalves', changes);
      const current = joined();
      profile = {
        ...current,
        paused: changes.paused ?? current.paused,
        veilDefault: changes.veilDefault ?? current.veilDefault,
        place: changes.clearPlace ? null : (changes.place ?? current.place),
      };
      return hub();
    },
    async rerollHalvesCodename() {
      await record('rerollHalvesCodename');
      profile = { ...joined(), codename: 'Vega-3' };
      return hub();
    },
    async leaveHalves() {
      await record('leaveHalves');
      profile = null;
      cases.clear();
    },
    async startHalvesCase(begin) {
      await record('startHalvesCase', begin);
      return start();
    },
    async createHalvesInvite(templateId) {
      await record('createHalvesInvite', templateId);
      joined();
      invite = { code: 'ABC234', expiresAt: '2026-11-27T12:00:00Z' };
      return invite;
    },
    async cancelHalvesInvite() {
      await record('cancelHalvesInvite');
      invite = null;
    },
    async redeemHalvesInvite(code) {
      await record('redeemHalvesInvite', code);
      if (code.toUpperCase() !== FAKE_FRIEND_CODE) throw new ApiError('not_found', 404);
      return start({ mode: 'friend', partner: { name: 'Vega-3', ai: false, place: 'city:Lyon' } });
    },
    async startHalvesDuoCase(duoId) {
      await record('startHalvesDuoCase', duoId);
      return start({ mode: 'duo' });
    },
    async removeHalvesDuo(duoId) {
      await record('removeHalvesDuo', duoId);
    },
    async removeHalvesBlock(blockId) {
      await record('removeHalvesBlock', blockId);
      blocks = blocks.filter((block) => block.id !== blockId);
    },
    async getHalvesCase(id) {
      await record('getHalvesCase', id);
      joined();
      return caseOf(id);
    },
    async sendHalvesMove(caseId, move) {
      await record('sendHalvesMove', caseId, move);
      const found = caseOf(caseId);
      const round = found.recordRound;
      if (!round) throw new ApiError('not_your_turn', 409);
      const mine = {
        id: `${caseId}-mine-${round}`,
        status: 'checking' as const,
        transcript: 'Ein Schaffner hat um 14 Uhr 20 einen Kasten gesehen',
        reasons: [],
        veiled: move.veiled ?? found.veilDefault,
        reaction: null,
        understood: null,
        corrections: [],
      };
      cases.set(caseId, {
        ...found,
        recordRound: null,
        rounds: found.rounds.map((r) => (r.round === round ? { ...r, mine } : r)),
      });
      return { id: mine.id, round, status: 'checking', transcript: mine.transcript };
    },
    async solveHalvesCase(caseId, option) {
      await record('solveHalvesCase', caseId, option);
      const found = caseOf(caseId);
      const changed: HalvesCase = {
        ...found,
        status: option === 0 ? 'solved' : 'open',
        final: { ...found.final, answers: [...found.final.answers, option], solution: 0 },
        recap: option === 0 ? [{ speaker: 'A', text: 'Wir haben es!', hasAudio: true }] : [],
        recapStatus: option === 0 ? 'ready' : 'none',
        ending: option === 0 ? 'Inès holt ihr Cello ab.' : null,
      };
      cases.set(caseId, changed);
      return changed;
    },
    async playHalvesAgain(caseId, yes) {
      await record('playHalvesAgain', caseId, yes);
      const changed = { ...caseOf(caseId), again: yes, askAgain: false };
      cases.set(caseId, changed);
      return changed;
    },
    async handOverHalvesSeat(caseId) {
      await record('handOverHalvesSeat', caseId);
      const found = caseOf(caseId);
      const changed = { ...found, canHandOver: false, partner: { ...found.partner, ai: true } };
      cases.set(caseId, changed);
      return changed;
    },
    async blockHalvesPartner(caseId) {
      await record('blockHalvesPartner', caseId);
      const found = caseOf(caseId);
      blocks = [...blocks, { id: `block-${caseId}`, codename: found.partner.name }];
      const changed = { ...found, partner: { name: 'Julien', ai: true, place: null } };
      cases.set(caseId, changed);
      return changed;
    },
    async getHalvesRecapAudio(caseId, line) {
      await record('getHalvesRecapAudio', caseId, line);
      return { url: `https://files.test/halves/${caseId}/recap-${line}.mp3` };
    },
    async getHalvesMoveAudio(moveId) {
      await record('getHalvesMoveAudio', moveId);
      return { url: `https://files.test/halves/${moveId}.mp3` };
    },
    async reactToHalvesMove(moveId, reaction) {
      await record('reactToHalvesMove', moveId, reaction);
      return withTheirs(moveId, (found) => ({
        ...found,
        rounds: found.rounds.map((r) =>
          r.theirs?.id === moveId ? { ...r, theirs: { ...r.theirs, reaction } } : r,
        ),
      }));
    },
    async answerHalvesMove(moveId, option) {
      await record('answerHalvesMove', moveId, option);
      return withTheirs(moveId, (found) => ({
        ...found,
        rounds: found.rounds.map((r) => {
          if (r.theirs?.id !== moveId) return r;
          const answers = [...r.theirs.answers, option];
          const settled = option === RIGHT || answers.length >= 2;
          return { ...r, theirs: { ...r.theirs, answers, solution: settled ? RIGHT : null } };
        }),
      }));
    },
    async reportHalvesMove(moveId, report) {
      await record('reportHalvesMove', moveId, report);
      return withTheirs(moveId, (found) => ({
        ...found,
        rounds: found.rounds.map((r) =>
          r.theirs?.id === moveId
            ? { ...r, theirs: { ...r.theirs, hidden: true, solution: RIGHT } }
            : r,
        ),
      }));
    },
    async getHalvesQueue() {
      await record('getHalvesQueue');
      return { items: queue };
    },
    async decideHalvesItem(kind, id, action) {
      await record('decideHalvesItem', kind, id, action);
      queue = queue.filter((item) => item.id !== id);
    },
  };
}
