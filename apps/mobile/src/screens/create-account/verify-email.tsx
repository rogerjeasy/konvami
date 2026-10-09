import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { authErrorCode, generalErrorKey, useAuthServices } from '@/auth';
import { Button } from '@/components/button';
import { CodeInput } from '@/components/code-input';
import { Icon } from '@/components/icon';
import { IconTile } from '@/components/icon-tile';
import { Reveal } from '@/components/motion';
import { StepHeader } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useCountdown } from '@/hooks/use-countdown';
import { canOpenMailApp, openMailApp } from '@/lib/external';
import { formatDuration } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { isVerificationCode } from '@/lib/validation';
import { useTheme } from '@/theme';
import { useSignUpDraft } from './draft';
import { SIGN_UP_STEPS } from './steps';

// How long the user waits before another code can be requested (seconds). The code email usually
// arrives within this time, and it keeps a tap-happy user under the service's sending limits.
const RESEND_WAIT_SECONDS = 60;

/**
 * 2.4 Verify email: the user enters the 6-digit code from the email. A correct code confirms the
 * account and signs them in with the password they just chose, which is then forgotten.
 */
export function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { provider, session } = useAuthServices();
  const { draft, reset } = useSignUpDraft();
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<{ message: string; inCode: boolean } | null>(null);
  const [resent, setResent] = useState(false);
  /** Set once the flow has moved on, so clearing the draft does not bounce this screen back. */
  const [finished, setFinished] = useState(false);

  const { secondsLeft, restart: restartWait } = useCountdown(RESEND_WAIT_SECONDS);
  const waiting = secondsLeft > 0;

  // No sign-up in progress (a deep link, a reload on web): start from the beginning.
  if (!draft.email && !finished) return <Redirect href={ROUTES.createAccount} />;
  const { email, password } = draft;

  function leave(to: typeof ROUTES.aiConsent | typeof ROUTES.signIn) {
    setFinished(true);
    router.replace(to);
    // The password has done its job; nothing typed during sign-up stays in memory.
    reset();
  }

  async function verify() {
    commitFeedback();
    setProblem(null);
    setResent(false);
    setSending(true);
    try {
      try {
        await provider.confirmSignUp(email, code);
      } catch (error) {
        // "Not authorized" here means the account is already verified (an earlier try got that
        // far): go on to sign in. Anything else is a real failure.
        if (authErrorCode(error) !== 'notAuthorized') throw error;
      }
      try {
        await session.signIn(email, password);
      } catch (error) {
        // The email is verified but this password is not the account's (the sign-up was started
        // earlier with another one): the user signs in with their own.
        if (authErrorCode(error) !== 'notAuthorized') throw error;
        leave(ROUTES.signIn);
        return;
      }
      leave(ROUTES.aiConsent);
    } catch (error) {
      const failure = authErrorCode(error);
      if (failure === 'invalidCode' || failure === 'expiredCode') {
        setProblem({ message: t(`verifyEmail.${failure}`), inCode: true });
        // An expired code can be replaced at once.
        if (failure === 'expiredCode') restartWait(0);
      } else {
        setProblem({ message: t(generalErrorKey(failure)), inCode: false });
      }
    } finally {
      setSending(false);
    }
  }

  async function resend() {
    setProblem(null);
    restartWait(RESEND_WAIT_SECONDS);
    try {
      await provider.resendCode(email);
      setCode('');
      setResent(true);
    } catch (error) {
      setProblem({ message: t(generalErrorKey(authErrorCode(error))), inCode: false });
      restartWait(0);
    }
  }

  return (
    <StepLayout
      header={
        <StepHeader
          step={SIGN_UP_STEPS.verify}
          total={SIGN_UP_STEPS.total}
          onBack={() => router.back()}
        />
      }
      actions={
        <Button
          label={t('verifyEmail.submit')}
          disabled={!isVerificationCode(code)}
          loading={sending}
          onPress={verify}
        />
      }
    >
      <Reveal>
        <View className="gap-2.5">
          <View className="pb-2.5">
            <IconTile icon="mail" />
          </View>
          <Text variant="title" accessibilityRole="header">
            {t('verifyEmail.title')}
          </Text>
          <Text tone="muted">
            <Trans
              i18nKey="verifyEmail.body"
              values={{ email }}
              components={{ strong: <Text variant="label" /> }}
            />
          </Text>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(1)}>
        <View className="gap-3">
          <CodeInput
            label={t('verifyEmail.codeLabel')}
            value={code}
            onChangeText={(next) => {
              setCode(next);
              setProblem(null);
            }}
            invalid={Boolean(problem?.inCode)}
            autoFocus
            onSubmitEditing={() => {
              if (isVerificationCode(code) && !sending) void verify();
            }}
          />
          {problem ? (
            <Text variant="small" tone="danger" role="alert" accessibilityLiveRegion="polite">
              {problem.message}
            </Text>
          ) : resent ? (
            <Text variant="small" tone="success" accessibilityLiveRegion="polite">
              {t('verifyEmail.resent')}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap items-center justify-between gap-x-3">
            {waiting ? (
              <Text variant="callout" tone="subtle" className="py-3">
                <Trans
                  i18nKey="verifyEmail.resendIn"
                  values={{ time: formatDuration(secondsLeft) }}
                  components={{
                    strong: <Text variant="labelSmall" style={{ fontVariant: ['tabular-nums'] }} />,
                  }}
                />
              </Text>
            ) : (
              <TextButton tone="primary" label={t('verifyEmail.resend')} onPress={resend} />
            )}
            <TextButton
              tone="primary"
              label={t('verifyEmail.changeEmail')}
              onPress={() => router.back()}
            />
          </View>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(2)}>
        <View className="gap-5">
          {canOpenMailApp ? (
            <Button
              variant="secondary"
              label={t('verifyEmail.openMail')}
              leading={<Icon name="externalLink" color={color.fg} size={size.iconMd} />}
              onPress={openMailApp}
            />
          ) : null}
          <Text variant="small" tone="subtle" className="text-center">
            {t('verifyEmail.spamHint')}
          </Text>
        </View>
      </Reveal>
    </StepLayout>
  );
}
