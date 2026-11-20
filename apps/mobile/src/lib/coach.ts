import type { Href } from 'expo-router';
import type { CoachAction } from '@konvami/api-client';
import {
  callRoute,
  examPrepRoute,
  importCallRoute,
  lessonCallRoute,
  pronunciationSoundRoute,
  reportRoute,
  reviewCallRoute,
  ROUTES,
} from './routes';

/**
 * Where a Coach suggestion starts with one tap (5.1, 5.26): a guided lesson, a report's
 * corrections to say again, the cards, a review conversation, a sound's drill, a speaking test,
 * a conversation, or a talk about an import. Null when the server left out what the action needs:
 * an action is never started by guesswork.
 */
export function coachRoute(action: CoachAction): Href | null {
  const partner = action.partnerId;
  switch (action.type) {
    case 'lesson':
      return partner && action.topic ? lessonCallRoute(partner, action.topic) : null;
    case 'say_it_better':
      return action.callId ? reportRoute(action.callId) : null;
    case 'review_cards':
      return ROUTES.review;
    case 'review_conversation':
      return partner ? reviewCallRoute(partner) : null;
    case 'sound_drill':
      return action.sound ? pronunciationSoundRoute(action.sound) : null;
    case 'exam':
      return action.exam ? examPrepRoute(action.exam) : null;
    case 'free_talk':
    case 'call_partner':
      return partner ? callRoute(partner) : null;
    case 'import_call':
      return partner && action.importId ? importCallRoute(partner, action.importId) : null;
    default:
      return null;
  }
}
