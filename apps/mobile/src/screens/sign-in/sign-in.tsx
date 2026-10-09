import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { authErrorCode, generalErrorKey, routeForSession, useAuthServices } from '@/auth';
import { MAX_SIGN_IN_TRIES, SIGN_IN_PAUSE_MINUTES } from '@/auth/attempts';
import { LogoMark } from '@/components/brand';
import { Button } from '@/components/button';
import { Link } from '@/components/link';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { AppleLogo, GoogleLogo } from '@/components/provider-logo';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { PasswordField, TextField } from '@/components/text-field';
import { formatDuration } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { isEmail } from '@/lib/validation';
import { useSignUpDraft } from '@/screens/create-account/draft';
import { useTheme } from '@/theme';
import { useAccessDraft } from './draft';
import { useSignInAttempts } from './use-sign-in-attempts';

// The app-icon tile in the header (pt), as on the design.
const LOGO_SIZE = 32;

/** Provider names are brand names, the same in every language. */
const PROVIDER_NAME = { apple: 'Apple', google: 'Google' } as const;

/** Sign-in ways that are drawn but not connected yet. */
type Unavailable = keyof typeof PROVIDER_NAME | 'link';

/**
 * 3.1 Sign in, and 3.2 its error state: email and password, checked by the service.
 *
 * A wrong password and an unknown email get the same answer, so the screen never reveals who has
 * an account. After a few wrong passwords sign-in pauses on this device (`@/auth/attempts`).
 * Apple, Google and the emailed sign-in link are drawn as designed but not connected yet, and
 * say so.
 */
export function SignInScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { provider, session } = useAuthServices();
  const access = useAccessDraft();
  const signUp = useSignUpDraft();
  const attempts = useSignInAttempts();
  const [email, setEmail] = useState(access.draft.email);
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  /** A wrong password (with the tries left), or a general failure message. */
  const [failure, setFailure] = useState<{ triesLeft: number } | { message: string } | null>(null);
  const [unavailable, setUnavailable] = useState<Unavailable | null>(null);

  const wrong = failure && 'triesLeft' in failure && !attempts.paused ? failure : null;
  const valid = isEmail(email) && password.length > 0;

  const toReset = () => {
    access.update({ email: email.trim() });
    router.push(ROUTES.forgotPassword);
  };

  async function submit() {
    commitFeedback();
    setFailure(null);
    setUnavailable(null);
    setSending(true);
    const address = email.trim();
    try {
      await session.signIn(address, password);
      attempts.clear();
      access.reset();
      router.replace(routeForSession(session.getState()));
    } catch (error) {
      const code = authErrorCode(error);
      if (code === 'notAuthorized') {
        setFailure({ triesLeft: attempts.recordFailure() });
      } else if (code === 'notConfirmed') {
        await finishSignUp(address);
      } else {
        setFailure({ message: t(generalErrorKey(code)) });
      }
    } finally {
      setSending(false);
    }
  }

  /** The password is right but the email was never verified: send a code and finish sign-up. */
  async function finishSignUp(address: string) {
    try {
      await provider.resendCode(address);
      signUp.update({ email: address, password });
      router.push(ROUTES.verifyEmail);
    } catch (error) {
      setFailure({ message: t(generalErrorKey(authErrorCode(error))) });
    }
  }

  const resetLink = <Link variant="callout" tone="danger" onPress={toReset} />;

  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center justify-between">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.welcome)}
          />
          <LogoMark size={LOGO_SIZE} tile />
          {/* Balances the back button so the logo sits in the middle. */}
          <View style={{ width: size.headerButton }} />
        </View>
      }
      actions={
        <>
          <Button
            label={t(failure ? 'signIn.tryAgain' : 'signIn.submit')}
            disabled={!valid || attempts.paused}
            loading={sending}
            onPress={submit}
          />
          <TextButton
            tone="primary"
            label={t('signIn.emailLink')}
            onPress={() => setUnavailable('link')}
          />
          <Text variant="bodySmall" tone="muted" className="pb-1 pt-2 text-center">
            {t('signIn.newHere')}{' '}
            <Link
              variant="labelMedium"
              onPress={() => router.push(routeForSession(session.getState()))}
            >
              {t('signIn.create')}
            </Link>
          </Text>
        </>
      }
    >
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {t('signIn.title')}
          </Text>
          <Text tone="muted">{t('signIn.body')}</Text>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(1)}>
        <View className="gap-4">
          {attempts.paused ? (
            <NoticeBox icon="alert" tone="danger" title={t('signIn.pausedTitle')}>
              <Trans
                i18nKey="signIn.paused"
                values={{ time: formatDuration(attempts.secondsLeft) }}
                components={{
                  strong: <Text variant="labelSmall" style={{ fontVariant: ['tabular-nums'] }} />,
                  reset: resetLink,
                }}
              />
            </NoticeBox>
          ) : wrong ? (
            <NoticeBox icon="alert" tone="danger" title={t('signIn.wrongTitle')}>
              <Trans i18nKey="signIn.wrongBody" components={{ reset: resetLink }} />
            </NoticeBox>
          ) : (
            // As drawn: when an error needs the space, it takes the place of the provider buttons.
            <>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button
                    variant="apple"
                    label={PROVIDER_NAME.apple}
                    accessibilityLabel={t('signIn.withProvider', { provider: PROVIDER_NAME.apple })}
                    leading={<AppleLogo color={color.appleFg} />}
                    onPress={() => setUnavailable('apple')}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    variant="secondary"
                    label={PROVIDER_NAME.google}
                    accessibilityLabel={t('signIn.withProvider', {
                      provider: PROVIDER_NAME.google,
                    })}
                    leading={<GoogleLogo />}
                    onPress={() => setUnavailable('google')}
                  />
                </View>
              </View>
              <View className="flex-row items-center gap-3">
                <View className="h-px flex-1 bg-border" />
                <Text variant="small" tone="subtle">
                  {t('signIn.orWithEmail')}
                </Text>
                <View className="h-px flex-1 bg-border" />
              </View>
            </>
          )}
          {unavailable ? (
            <NoticeBox icon="info">
              {unavailable === 'link'
                ? t('signIn.emailLinkSoon')
                : t('createAccount.comingSoon', { provider: PROVIDER_NAME[unavailable] })}
            </NoticeBox>
          ) : null}
          {failure && 'message' in failure ? (
            <NoticeBox icon="alert" tone="danger">
              {failure.message}
            </NoticeBox>
          ) : null}
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(2)}>
        <View className="gap-4">
          <TextField
            label={t('signIn.email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            inputMode="email"
            autoComplete="username"
            textContentType="username"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
          <PasswordField
            label={t('signIn.password')}
            value={password}
            onChangeText={setPassword}
            placeholder={t('signIn.passwordPlaceholder')}
            error={
              wrong && wrong.triesLeft > 0 && wrong.triesLeft < MAX_SIGN_IN_TRIES
                ? t('signIn.triesLeft', {
                    count: wrong.triesLeft,
                    minutes: SIGN_IN_PAUSE_MINUTES,
                  })
                : undefined
            }
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => {
              if (valid && !attempts.paused && !sending) void submit();
            }}
          />
          <View className="-mt-2 items-end">
            <TextButton tone="primary" label={t('signIn.forgot')} onPress={toReset} />
          </View>
        </View>
      </Reveal>
    </StepLayout>
  );
}
