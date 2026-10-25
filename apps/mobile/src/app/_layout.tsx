import '../../global.css';
import '@/i18n';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
// One import per weight: the package root would bundle every font file.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Lexend_600SemiBold } from '@expo-google-fonts/lexend/600SemiBold';
import { AuthServicesProvider, authServices } from '@/auth';
import { OnboardingProvider, onboardingStore } from '@/onboarding';
import { PracticeProvider, practiceServices } from '@/practice';
import { followPhoneLanguage, loadPreferences } from '@/preferences';
import { ProfileProvider, profileServices } from '@/profile';
import { appReminderDevice } from '@/reminders/app-device';
import { RemindersProvider } from '@/reminders/services';
import { ReminderKeeper } from '@/reminders/use-reminders';
import { SignUpDraftProvider } from '@/screens/create-account/draft';
import { ScreenBoundary } from '@/screens/error';
import { ExamNotesProvider } from '@/screens/exams/notes';
import { AccessDraftProvider } from '@/screens/sign-in/draft';
import { ThemeProvider, useTheme } from '@/theme';
import {
  createAppVoiceEngine,
  RecorderProvider,
  useAppSentenceRecorder,
  VoiceProvider,
} from '@/voice';

// What shows when this layout itself breaks; each screen has its own boundary (`RootStack`).
export { AppError as ErrorBoundary } from '@/screens/error';

// The native splash stays up until fonts, saved preferences and the saved session are ready, so
// nothing flickers and a signed-in user never sees the signed-out screens.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Lexend_600SemiBold,
  });
  const [prefsReady, setPrefsReady] = useState(false);
  useEffect(() => {
    // Neither call throws: a broken store means defaults and signed out, never a stuck splash.
    Promise.all([loadPreferences(), authServices.session.restore()]).finally(() =>
      setPrefsReady(true),
    );
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
            <ProfileProvider services={profileServices}>
              <RemindersProvider device={appReminderDevice}>
                <RecorderProvider useRecorder={useAppSentenceRecorder}>
                  <VoiceProvider createEngine={createAppVoiceEngine}>
                    <SignUpDraftProvider>
                      <AccessDraftProvider>
                        <ExamNotesProvider>
                          <StatusBar style="auto" />
                          <ReminderKeeper />
                          <RootStack />
                        </ExamNotesProvider>
                      </AccessDraftProvider>
                    </SignUpDraftProvider>
                  </VoiceProvider>
                </RecorderProvider>
              </RemindersProvider>
            </ProfileProvider>
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
