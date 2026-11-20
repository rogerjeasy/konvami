import { api } from '@/api';
import { HalvesProvider } from '@/halves/services';
import '../../global.css';
import '@/i18n';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
// One import per weight: the package root would bundle every font file.
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif/400Regular_Italic';
import { track } from '@/analytics';
import { AuthServicesProvider, authServices } from '@/auth';
import { initMonitoring, monitored } from '@/monitoring';
import { OnboardingProvider, onboardingStore } from '@/onboarding';
import { appPurchaseDevice } from '@/plan/app-device';
import { PlanProvider } from '@/plan/services';
import { PracticeProvider, practiceServices } from '@/practice';
import { followPhoneLanguage, loadPreferences } from '@/preferences';
import { ProfileProvider, profileServices } from '@/profile';
import { appReminderDevice } from '@/reminders/app-device';
import { RemindersProvider } from '@/reminders/services';
import { ReminderKeeper } from '@/reminders/use-reminders';
import { SignUpDraftProvider } from '@/screens/create-account/draft';
import { ScreenBoundary } from '@/screens/error';
import { PaywallSheet } from '@/screens/plan/paywall-sheet';
import { ExamNotesProvider } from '@/screens/exams/notes';
import { AccessDraftProvider } from '@/screens/sign-in/draft';
import { ThemeProvider, useTheme } from '@/theme';
import {
  appVideoAvatars,
  createAppVoiceEngine,
  RecorderProvider,
  useAppSentenceRecorder,
  VideoAvatarProvider,
  VoiceProvider,
} from '@/voice';

// What shows when this layout itself breaks; each screen has its own boundary (`RootStack`).
export { AppError as ErrorBoundary } from '@/screens/error';

// Crash reporting starts before anything renders, so an error while starting up is reported too.
initMonitoring();

// The native splash stays up until fonts, saved preferences and the saved session are ready, so
// nothing flickers and a signed-in user never sees the signed-out screens.
SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_800ExtraBold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
    InstrumentSerif_400Regular_Italic,
  });
  const [prefsReady, setPrefsReady] = useState(false);
  useEffect(() => {
    // Neither call throws: a broken store means defaults and signed out, never a stuck splash.
    Promise.all([loadPreferences(), authServices.session.restore()]).finally(() => {
      setPrefsReady(true);
      // The learner's choice is loaded by now, so this counts only if they agreed to it (6.7).
      track('app_opened');
    });
    return followPhoneLanguage();
  }, []);

  const ready = (fontsLoaded || Boolean(fontError)) && prefsReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider>
      <AuthServicesProvider services={authServices}>
        <OnboardingProvider store={onboardingStore}>
          <PracticeProvider services={practiceServices}>
            <HalvesProvider api={api}>
              <ProfileProvider services={profileServices}>
                <PlanProvider device={appPurchaseDevice}>
                  <RemindersProvider device={appReminderDevice}>
                    <RecorderProvider useRecorder={useAppSentenceRecorder}>
                      <VoiceProvider createEngine={createAppVoiceEngine}>
                        <VideoAvatarProvider avatars={appVideoAvatars}>
                          <SignUpDraftProvider>
                            <AccessDraftProvider>
                              <ExamNotesProvider>
                                <StatusBar style="auto" />
                                <ReminderKeeper />
                                <RootStack />
                                <PaywallSheet />
                              </ExamNotesProvider>
                            </AccessDraftProvider>
                          </SignUpDraftProvider>
                        </VideoAvatarProvider>
                      </VoiceProvider>
                    </RecorderProvider>
                  </RemindersProvider>
                </PlanProvider>
              </ProfileProvider>
            </HalvesProvider>
          </PracticeProvider>
        </OnboardingProvider>
      </AuthServicesProvider>
    </ThemeProvider>
  );
}

function RootStack() {
  const { color } = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}
      // A screen that breaks shows a plain message in its place, and the rest of the app goes on.
      screenLayout={({ children }) => <ScreenBoundary>{children}</ScreenBoundary>}
    >
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="intro" options={{ animation: 'fade' }} />
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      {/* Reached by replacing the screen before them: a fade reads as "next", not "back". */}
      <Stack.Screen name="ai-consent" options={{ animation: 'fade' }} />
      <Stack.Screen name="all-set" options={{ animation: 'fade' }} />
      <Stack.Screen name="home" options={{ animation: 'fade' }} />
      <Stack.Screen name="welcome-back" options={{ animation: 'fade' }} />
      <Stack.Screen name="password-updated" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding/review" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding/talk" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding/placement/index" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding/placement/talk" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding/placement/result" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding/partners/index" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding/ready" options={{ animation: 'fade' }} />
      {/* The app itself. Entering it, and a call beginning and ending, are not steps forward. */}
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="call/[personaId]" options={{ animation: 'fade' }} />
      <Stack.Screen name="conversations/[id]/done" options={{ animation: 'fade' }} />
    </Stack>
  );
}

export default monitored(RootLayout);
