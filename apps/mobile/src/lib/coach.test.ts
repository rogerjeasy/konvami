import type { CoachAction } from '@konvami/api-client';
import { coachRoute } from './coach';

const NONE = {
  topic: null,
  sound: null,
  exam: null,
  partnerId: null,
  callId: null,
  importId: null,
  count: null,
} as const;
const LENA = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';

function action(changes: Partial<CoachAction> & Pick<CoachAction, 'type'>): CoachAction {
  return { ...NONE, ...changes };
}

describe('where a Coach suggestion starts', () => {
  it('opens each kind of action', () => {
    expect(coachRoute(action({ type: 'lesson', topic: 'dative', partnerId: LENA }))).toEqual({
      pathname: '/call/[personaId]',
      params: { personaId: LENA, practise: 'lesson:dative' },
    });
    expect(coachRoute(action({ type: 'say_it_better', callId: 'rtc_1' }))).toEqual({
      pathname: '/conversations/[id]/report',
      params: { id: 'rtc_1' },
    });
    expect(coachRoute(action({ type: 'review_cards', count: 12 }))).toBe('/review');
    expect(coachRoute(action({ type: 'review_conversation', partnerId: LENA }))).toEqual({
      pathname: '/call/[personaId]',
      params: { personaId: LENA, practise: 'words' },
    });
    expect(coachRoute(action({ type: 'sound_drill', sound: 'ch' }))).toEqual({
      pathname: '/pronunciation/[sound]',
      params: { sound: 'ch' },
    });
    expect(coachRoute(action({ type: 'exam', exam: 'goethe_b1' }))).toEqual({
      pathname: '/exams/[exam]',
      params: { exam: 'goethe_b1' },
    });
    expect(coachRoute(action({ type: 'call_partner', partnerId: LENA }))).toEqual({
      pathname: '/call/[personaId]',
      params: { personaId: LENA },
    });
    expect(
      coachRoute(
        action({
          type: 'import_call',
          partnerId: LENA,
          importId: '12345678-1234-4234-8234-123456789abc',
        }),
      ),
    ).toEqual({
      pathname: '/call/[personaId]',
      params: { personaId: LENA, practise: 'import:12345678123442348234123456789abc' },
    });
  });

  it('starts nothing when what an action needs is missing', () => {
    expect(coachRoute(action({ type: 'lesson', topic: 'dative' }))).toBeNull();
    expect(coachRoute(action({ type: 'sound_drill' }))).toBeNull();
    expect(coachRoute(action({ type: 'free_talk' }))).toBeNull();
  });
});
