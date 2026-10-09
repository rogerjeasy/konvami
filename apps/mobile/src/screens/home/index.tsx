import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { OnboardingGate } from '@/onboarding/gate';
import { routeForOnboarding } from '@/onboarding/routing';
import { UpcomingScreen } from '@/screens/upcoming';

/**
 * Where a signed-in user lands. It asks the server how far onboarding has come and continues
 * there, so closing the app never loses a step. Once onboarding is done it shows the
 * placeholder; the app's real home screen replaces that.
 */
export function HomeScreen() {
  return (
    // An empty top row keeps the loading note where a screen's content starts.
    <OnboardingGate header={<View className="min-h-tap" />}>
      {({ status }) => {
        const route = routeForOnboarding(status);
        return route ? <Redirect href={route} /> : <UpcomingScreen />;
      }}
    </OnboardingGate>
  );
}
