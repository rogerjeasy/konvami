import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { motion, size, space } from '@konvami/design-tokens';
import { useAuthServices, useSession } from '@/auth';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Reveal } from '@/components/motion';
import { Text } from '@/components/text';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { useTheme } from '@/theme';

/**
 * Stand-in for pages that are not built yet (the legal pages), so every link leads somewhere.
 * Each route is replaced by its real screen when it is built.
 *
 * A signed-in user also gets "Sign out" here, as on 5.9 Account: someone who lands here before
 * finishing onboarding has no other way to end a session.
 */
export function UpcomingScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useScreenLayout();
  const { session } = useAuthServices();
  const { status } = useSession();
  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: insets.top + space.sm, paddingHorizontal: gutter }}
    >
      <Pressable
        onPress={() => backOr(ROUTES.welcome)}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        className="min-h-tap min-w-tap items-start justify-center active:opacity-pressed"
      >
        <Icon name="arrowLeft" color={color.fg} size={size.iconLg} />
      </Pressable>
      <View className="w-full max-w-content gap-3 self-center pt-8">
        <Reveal>
          <Text variant="title" accessibilityRole="header">
            {t('upcoming.title')}
          </Text>
        </Reveal>
        <Reveal delay={motion.stagger}>
          <Text tone="muted">{t('upcoming.body')}</Text>
        </Reveal>
        {status === 'signedIn' ? (
          <Reveal delay={motion.stagger * 2}>
            <View className="pt-5">
              <Button
                variant="secondary"
                label={t('common.signOut')}
                onPress={async () => {
                  await session.signOut();
                  router.replace(ROUTES.welcome);
                }}
              />
            </View>
          </Reveal>
        ) : null}
      </View>
    </View>
  );
}
