import { GoalsStep } from '@/screens/onboarding/goals';

// 4.2 Onboarding form, step 3: goals and exam. Wrapped because the screen takes an optional
// date, and a route gets route props.
export default function Goals() {
  return <GoalsStep />;
}
