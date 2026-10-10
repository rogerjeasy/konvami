import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthServices, useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Reveal } from '@/components/motion';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1">
      <Text variant="overline" tone="subtle">
        {label}
      </Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

/**
 * 5.9 Account: who is signed in, and the way out. The profile, memories, subscription and
 * privacy settings of spec §14.1 join it as they are built.
 */
export function AccountScreen() {
  const { t } = useTranslation();
  const { session } = useAuthServices();
  const { status, user } = useSession();
  const [leaving, setLeaving] = useState(false);

  // While signing out, the screen stays as it is until Welcome replaces it.
  if (status !== 'signedIn' && !leaving) return <Redirect href={ROUTES.welcome} />;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.today)}
          />
        </View>
      }
      actions={
        <Button
          variant="secondary"
          label={t('common.signOut')}
          loading={leaving}
          onPress={async () => {
            setLeaving(true);
            await session.signOut();
            router.replace(ROUTES.welcome);
          }}
        />
      }
    >
      <Reveal>
        <Text variant="title" accessibilityRole="header">
          {t('account.title')}
        </Text>
      </Reveal>
      <Reveal delay={staggerDelay(1)}>
        <Card className="gap-4 p-4">
          {user?.firstName ? (
            <Row label={t('emailSignUp.firstName')} value={user.firstName} />
          ) : null}
          {user?.email ? <Row label={t('emailSignUp.email')} value={user.email} /> : null}
        </Card>
      </Reveal>
    </StepLayout>
  );
}
