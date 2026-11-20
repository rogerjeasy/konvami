import type { Href } from 'expo-router';
import type { Quest, QuestKind } from '@konvami/api-client';
import { callRoute, penPalRoute, reviewCallRoute, ROUTES } from '@/lib/routes';

/**
 * Where each weekly quest is done (spec §6.15). Most are a conversation with a partner; the
 * rest open the screen where that speaking happens. `partnerId` is who Today suggests; without
 * one, the conversation quests open Talk to choose.
 */
export function questRoute(kind: QuestKind, partnerId: string | null): Href {
  switch (kind) {
    case 'talk_days':
    case 'long_call':
    case 'use_word':
      return partnerId ? callRoute(partnerId) : ROUTES.talk;
    case 'review_call':
      return partnerId ? reviewCallRoute(partnerId) : ROUTES.talk;
    case 'quiet_partner':
      // Catching up is with a partner not talked to lately: the learner picks who on Talk.
      return ROUTES.talk;
    case 'role_play_goal':
      return ROUTES.rolePlays;
    case 'say_it_better':
      // "Say it better" is on a report, reached from a conversation in the library.
      return ROUTES.library;
    case 'pen_pal':
      return penPalRoute();
    case 'sound_drills':
      return ROUTES.pronunciation;
  }
}

/** The quest's line, as a key and the count its plural takes. */
export function questWords(quest: Pick<Quest, 'kind' | 'target'>): {
  key: `motivation.quests.kinds.${QuestKind}`;
  count: number;
} {
  return { key: `motivation.quests.kinds.${quest.kind}`, count: quest.target };
}
