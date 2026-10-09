import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { Reveal } from '@/components/motion';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';

/**
 * Shown to someone under the minimum age (spec D16). It is a plain, friendly stop: no error
 * color, and nothing about the date is stored.
 */
export function AgeRestrictedScreen() {
  const { t } = useTranslation();
  const toStart = () => router.replace(ROUTES.welcome);
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row">
          <HeaderButton icon="close" label={t('common.close')} onPress={toStart} />
        </View>
      }
      actions={<Button label={t('ageRestricted.back')} onPress={toStart} />}
    >
      <Reveal>
        <Text variant="title" accessibilityRole="header">
          {t('ageRestricted.title')}
        </Text>
      </Reveal>
      <Reveal delay={staggerDelay(1)}>
        <Text tone="muted">{t('ageRestricted.body')}</Text>
      </Reveal>
    </StepLayout>
  );
}
