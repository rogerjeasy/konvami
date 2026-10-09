import type { Href } from 'expo-router';
import type { Onboarding } from '@konvami/api-client';
import { ROUTES } from '@/lib/routes';
import { firstOpenStep, type EssentialStep } from './essentials';

/** The route of each form step. */
export const STEP_ROUTES = {
  language: ROUTES.onboardingLanguage,
  explanations: ROUTES.onboardingExplanations,
  goals: ROUTES.onboardingGoals,
  level: ROUTES.onboardingLevel,
  course: ROUTES.onboardingCourse,
} as const satisfies Record<EssentialStep, Href>;

// How many essential fields exist; a learner missing all of them has not started.
const ESSENTIAL_FIELD_COUNT = 7;

/** Where onboarding continues for a learner at this stage, or null once it is done. */
export function routeForOnboarding(status: Onboarding): Href | null {
  switch (status.stage) {
    case 'essentials':
      if (status.missing.length >= ESSENTIAL_FIELD_COUNT) return ROUTES.allSet;
      return STEP_ROUTES[firstOpenStep(status.missing) ?? 'language'];
    case 'review':
      return ROUTES.onboardingReview;
    case 'placement':
      // A test that was started is followed up where its result appears: that screen waits for
      // the assessment, offers the choice of level, or says that the test could not be measured.
      return status.placement === 'not_started'
        ? ROUTES.onboardingPlacement
        : ROUTES.onboardingPlacementResult;
    case 'partners':
      return ROUTES.onboardingPartners;
    case 'ready':
      return ROUTES.onboardingReady;
    case 'done':
      return null;
  }
}
