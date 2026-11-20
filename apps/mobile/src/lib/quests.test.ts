import type { QuestKind } from '@konvami/api-client';
import { questRoute, questWords } from './quests';
import { callRoute, penPalRoute, reviewCallRoute, ROUTES } from './routes';

const ALL: QuestKind[] = [
  'talk_days',
  'long_call',
  'review_call',
  'role_play_goal',
  'say_it_better',
  'use_word',
  'pen_pal',
  'quiet_partner',
  'sound_drills',
];

describe('where a quest is done', () => {
  it('opens a conversation with the suggested partner', () => {
    expect(questRoute('talk_days', 'lena')).toEqual(callRoute('lena'));
    expect(questRoute('long_call', 'lena')).toEqual(callRoute('lena'));
    expect(questRoute('review_call', 'lena')).toEqual(reviewCallRoute('lena'));
  });

  it('opens Talk to choose a partner when there is none to suggest', () => {
    expect(questRoute('talk_days', null)).toBe(ROUTES.talk);
    expect(questRoute('quiet_partner', 'lena')).toBe(ROUTES.talk);
  });

  it('opens the screen where the rest are done', () => {
    expect(questRoute('role_play_goal', 'lena')).toBe(ROUTES.rolePlays);
    expect(questRoute('say_it_better', 'lena')).toBe(ROUTES.library);
    expect(questRoute('pen_pal', 'lena')).toEqual(penPalRoute());
    expect(questRoute('sound_drills', 'lena')).toBe(ROUTES.pronunciation);
  });

  it('has a place for every kind', () => {
    for (const kind of ALL) expect(questRoute(kind, 'lena')).toBeTruthy();
  });

  it('names a quest with its target as the plural count', () => {
    expect(questWords({ kind: 'sound_drills', target: 3 })).toEqual({
      key: 'motivation.quests.kinds.sound_drills',
      count: 3,
    });
  });
});
