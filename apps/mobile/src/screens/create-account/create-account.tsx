import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { LogoMark } from '@/components/brand';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Link } from '@/components/link';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { AppleLogo, GoogleLogo } from '@/components/provider-logo';
import { StepHeader } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { openLegal } from '@/lib/external';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { useTheme } from '@/theme';
import { useSignUpDraft } from './draft';
import { SIGN_UP_STEPS } from './steps';

// The app-icon tile above the title (pt), as on the design.
const LOGO_SIZE = 52;

/** Provider names are brand names, the same in every language. */
const PROVIDER_NAME = { apple: 'Apple', google: 'Google' } as const;

/**
 * 2.2 Create account: choose how to sign up. Email is live. Apple and Google are drawn as
 * designed but not connected yet (they need the developer accounts' credentials), so they say so
 * instead of failing silently.
 */
export function CreateAccountScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { draft } = useSignUpDraft();
  const [unavailable, setUnavailable] = useState<keyof typeof PROVIDER_NAME | null>(null);

  // Reached without passing the age check (a deep link, a reload on web): start there.
  if (!draft.ageBracket) return <Redirect href={ROUTES.createAccount} />;

  return (
    <StepLayout
      header={
        <StepHeader
          step={SIGN_UP_STEPS.account}
          total={SIGN_UP_STEPS.total}
          onBack={() => router.back()}
        />
      }
      footer={
        <View className="items-center gap-3.5">
          <Text variant="bodySmall" tone="muted" className="text-center">
            {t('createAccount.haveAccount')}{' '}
            <Link variant="labelMedium" onPress={() => router.push(ROUTES.signIn)}>
              {t('createAccount.signIn')}
            </Link>
          </Text>
          <Text variant="caption" tone="subtle" className="text-center">
            <Trans
              i18nKey="createAccount.legal"
              components={{
                terms: <Link variant="caption" onPress={() => openLegal('terms')} />,
                privacy: <Link variant="caption" onPress={() => openLegal('privacy')} />,
              }}
            />
          </Text>
        </View>
      }
    >
      <Reveal>
        <View className="gap-2.5">
          <View className="pb-2">
            <LogoMark size={LOGO_SIZE} tile />
          </View>
          <Text variant="title" accessibilityRole="header">
            {t('createAccount.title')}
          </Text>
          <Text tone="muted">{t('createAccount.body')}</Text>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(1)}>
        <View className="gap-3">
          <Button
            variant="apple"
            label={t('createAccount.apple')}
            leading={<AppleLogo color={color.appleFg} />}
            onPress={() => setUnavailable('apple')}
          />
          <Button
            variant="secondary"
            label={t('createAccount.google')}
            leading={<GoogleLogo />}
            onPress={() => setUnavailable('google')}
          />
          {unavailable ? (
            <NoticeBox icon="info">
              {t('createAccount.comingSoon', { provider: PROVIDER_NAME[unavailable] })}
            </NoticeBox>
          ) : null}
          <View className="flex-row items-center gap-3 py-1.5">
            <View className="h-px flex-1 bg-border" />
            <Text variant="small" tone="subtle">
              {t('common.or')}
            </Text>
            <View className="h-px flex-1 bg-border" />
          </View>
          <Button
            variant="secondary"
            label={t('createAccount.email')}
            leading={<Icon name="mail" color={color.fg} size={size.iconMd} />}
            onPress={() => router.push(ROUTES.signUpEmail)}
          />
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(2)}>
        <NoticeBox icon="shield">{t('createAccount.euNotice')}</NoticeBox>
      </Reveal>
    </StepLayout>
  );
}
