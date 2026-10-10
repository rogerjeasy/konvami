import type { Onboarding } from '@konvami/api-client';
import { routeForOnboarding } from './routing';

const ALL = [
  'target_language',
  'explanation_language',
  'explanation_usage',
  'goals',
  'exam',
  'self_assessed_level',
  'course',
];

const at = (
  stage: Onboarding['stage'],
  placement: Onboarding['placement'] = 'not_started',
  missing: string[] = [],
): Onboarding => ({ stage, missing, placement });

describe('routeForOnboarding', () => {
  it('starts a learner who has answered nothing on the All set screen', () => {
    expect(routeForOnboarding(at('essentials', 'not_started', ALL))).toBe('/all-set');
  });

  it('resumes a half-finished setup at the first open question', () => {
    expect(routeForOnboarding(at('essentials', 'not_started', ['goals', 'exam', 'course']))).toBe(
      '/onboarding/goals',
    );
  });

  it('shows the review once every question has an answer', () => {
    expect(routeForOnboarding(at('review'))).toBe('/onboarding/review');
  });

  it('introduces the placement test to a learner who has not taken it', () => {
    expect(routeForOnboarding(at('placement'))).toBe('/onboarding/placement');
  });

  // A test that was started is followed up on the result screen: it waits for the assessment,
  // offers the choice, or says that the test could not be measured.
  it.each(['in_progress', 'assessing', 'measured', 'inconclusive'] as const)(
    'opens the result of a placement test that is %s',
    (placement) => {
      expect(routeForOnboarding(at('placement', placement))).toBe('/onboarding/placement/result');
    },
  );

  it('goes on to the starter partners once the level is settled', () => {
    expect(routeForOnboarding(at('partners', 'decided'))).toBe('/onboarding/partners');
    expect(routeForOnboarding(at('partners', 'skipped'))).toBe('/onboarding/partners');
  });

  it('shows the ready screen until the learner has entered the app', () => {
    expect(routeForOnboarding(at('ready', 'decided'))).toBe('/onboarding/ready');
  });

  it('has nowhere left to go when onboarding is done', () => {
    expect(routeForOnboarding(at('done', 'decided'))).toBeNull();
  });
});
