import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { routeForSession, useAuthServices } from '@/auth';
import { Wordmark } from '@/components/brand';
import { Button } from '@/components/button';
import { Reveal } from '@/components/motion';
import { HeroLayout } from '@/components/hero-layout';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { useTheme } from '@/theme';
import { GreetingFlags } from './greeting-flags';
import { LanguagePicker } from './language-picker';

// Wordmark height in the header (pt), as on the design.
const WORDMARK_HEIGHT = 20;
// Text and buttons rise in just after the first greeting pops (positions in the stagger).
const ORDER = { header: 0, title: 1, body: 2, primary: 3, secondary: 4 } as const;

/** 1.5 Welcome: the entry point for new and returning users, with the app-language switch. */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { session } = useAuthServices();
  return (
    <HeroLayout
      panel="bleed"
      screenHeader={
        <Reveal delay={staggerDelay(ORDER.header)}>
          <View className="min-h-tap flex-row flex-wrap items-center justify-between gap-3">
            <Wordmark height={WORDMARK_HEIGHT} color={color.fg} label={t('common.appName')} />
            <LanguagePicker />
          </View>
        </Reveal>
      }
      hero={<GreetingFlags />}
      body={
        <>
          <Reveal delay={staggerDelay(ORDER.title)}>
            <Text variant="title" accessibilityRole="header">
              {t('welcome.title')}
            </Text>
          </Reveal>
          <Reveal delay={staggerDelay(ORDER.body)}>
            <Text tone="muted">{t('welcome.body')}</Text>
          </Reveal>
        </>
      }
      actions={
        <>
          <Reveal delay={staggerDelay(ORDER.primary)}>
            <Button
              label={t('welcome.getStarted')}
              onPress={() => {
                commitFeedback();
                // A signed-in user never repeats sign-up: they resume where they left off.
                router.push(routeForSession(session.getState()));
              }}
            />
          </Reveal>
          <Reveal delay={staggerDelay(ORDER.secondary)}>
            <Button
              variant="secondary"
              label={t('welcome.haveAccount')}
              onPress={() => router.push(ROUTES.signIn)}
            />
          </Reveal>
        </>
      }
    />
  );
}
