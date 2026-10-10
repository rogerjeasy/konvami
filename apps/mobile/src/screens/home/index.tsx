import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { ROUTES } from '@/lib/routes';
import { OnboardingGate } from '@/onboarding/gate';
import { routeForOnboarding } from '@/onboarding/routing';

/**
 * Where a signed-in user lands. It asks the server how far onboarding has come and continues
 * there, so closing the app never loses a step. Once onboarding is done it enters the app.
 */
export function HomeScreen() {
  return (
    // An empty top row keeps the loading note where a screen's content starts.
    <OnboardingGate header={<View className="min-h-tap" />}>
      {({ status }) => <Redirect href={routeForOnboarding(status) ?? ROUTES.today} />}
    </OnboardingGate>
  );
}
