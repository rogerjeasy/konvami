import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { routeForSession, useAuthServices, useSession } from '@/auth';
import { Button } from '@/components/button';
import { Reveal } from '@/components/motion';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { useAccessDraft } from './draft';
import { DoneIllustration } from './illustrations';

/**
 * 3.8 Password updated: the reset is done and the user is signed in. It says other devices were
 * signed out only when they really were.
 */
export function PasswordUpdatedScreen() {
  const { t } = useTranslation();
  const { session } = useAuthServices();
  const { status } = useSession();
  const { draft, reset } = useAccessDraft();

  // One success haptic, with the confirmation it belongs to.
  useEffect(() => {
    if (status === 'signedIn') successFeedback();
  }, [status]);

  if (status !== 'signedIn') return <Redirect href={ROUTES.signIn} />;

  return (
    <StepLayout
      // No way back: the reset is finished, and the screens before it have nothing left to do.
      header={<View className="min-h-tap" />}
      actions={
        <Button
          label={t('passwordUpdated.continue')}
          onPress={() => {
            commitFeedback();
            router.replace(routeForSession(session.getState()));
            reset();
          }}
        />
      }
    >
      <Reveal>
        <View className="pt-6">
          <DoneIllustration />
        </View>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <View className="items-center gap-2.5">
          <Text variant="title" accessibilityRole="header" className="text-center">
            {t('passwordUpdated.title')}
          </Text>
          <Text tone="muted" className="text-center">
            {t(draft.signedOutOthers ? 'passwordUpdated.bodyEverywhere' : 'passwordUpdated.body')}
          </Text>
        </View>
      </Reveal>
    </StepLayout>
  );
}
