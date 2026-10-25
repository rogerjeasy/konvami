import type { PlanSession } from '@konvami/api-client';
import { formatList, weekdayNames } from './format';
import { callRoute, reviewCallRoute } from './routes';

/**
 * The call one session of the week's plan starts: a review conversation around the due words,
 * a role-play with its situation, or a free conversation; the last two put the week's topic
 * first.
 */
export function sessionRoute(session: PlanSession, personaId: string) {
  if (session.kind === 'review') return reviewCallRoute(personaId);
  return callRoute(personaId, {
    scenario: session.scenario ?? undefined,
    practise: session.topic ?? undefined,
  });
}

/** The weekdays of a few dates ("Tuesday and Wednesday"), for why today has a little more. */
export function missedDays(locale: string, dates: readonly string[]): string {
  const names = weekdayNames(locale);
  return formatList(
    locale,
    // ISO dates name a day of the calendar; its weekday does not depend on a time zone.
    dates.map((date) => names[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7] ?? date),
  );
}
