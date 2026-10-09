import { AgeCheckScreen } from '@/screens/create-account/age-check';

// 2.1 Age check. Wrapped because the screen takes an optional date, and a route gets route props.
export default function AgeCheck() {
  return <AgeCheckScreen />;
}
