import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { authErrorCode, generalErrorKey, useAuthServices } from '@/auth';
import { Button } from '@/components/button';
import { CodeInput } from '@/components/code-input';
import { Icon } from '@/components/icon';
import { Link } from '@/components/link';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useCountdown } from '@/hooks/use-countdown';
import { canOpenMailApp, openMailApp } from '@/lib/external';
import { formatDuration } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { isVerificationCode } from '@/lib/validation';
import { useTheme } from '@/theme';
import { useAccessDraft } from './draft';
import { SentIllustration } from './illustrations';

// How long the user waits before another code can be requested (seconds).
const RESEND_WAIT_SECONDS = 60;

/**
 * 3.6 Check your email: the user enters the 6-digit reset code. The design draws a reset link;
 * the service sends a code, so this screen has the code field the link would have replaced.
 * The code is checked together with the new password on the next screen (the service has no
 * call that checks a code on its own).
 */
export function ResetCodeScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { provider } = useAuthServices();
  const { draft, update } = useAccessDraft();
  const [code, setCode] = useState('');
  const [resent, setResent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { secondsLeft, restart } = useCountdown(RESEND_WAIT_SECONDS);

  // No reset in progress (a deep link, a reload on web): start from the beginning.
  if (!draft.email) return <Redirect href={ROUTES.forgotPassword} />;
  const { email } = draft;

  const refused = draft.codeRefused && code.length === 0 && !resent;
  const message = problem ?? (refused ? t('resetCode.invalidCode') : null);

  function next() {
    update({ code, codeRefused: false });
    router.push(ROUTES.newPassword);
  }

  async function resend() {
    setProblem(null);
    restart(RESEND_WAIT_SECONDS);
    try {
      await provider.requestPasswordReset(email);
      setCode('');
      setResent(true);
    } catch (error) {
      setProblem(t(generalErrorKey(authErrorCode(error))));
      restart(0);
    }
  }

  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.forgotPassword)}
          />
        </View>
      }
      actions={
        <>
          <Button
            label={t('common.continue')}
            disabled={!isVerificationCode(code)}
            onPress={next}
          />
          <Text variant="bodySmall" tone="muted" className="py-3 text-center">
            {t('forgotPassword.remembered')}{' '}
            <Link variant="labelMedium" onPress={() => router.replace(ROUTES.signIn)}>
              {t('forgotPassword.backToSignIn')}
            </Link>
          </Text>
        </>
      }
    >
      <Reveal>
        <SentIllustration />
      </Reveal>

      <Reveal delay={staggerDelay(1)}>
        <View className="items-center gap-2.5">
          <Text variant="title" accessibilityRole="header" className="text-center">
            {t('resetCode.title')}
          </Text>
          <Text tone="muted" className="text-center">
            <Trans
              i18nKey="resetCode.body"
              values={{ email }}
              components={{ strong: <Text variant="label" /> }}
            />
          </Text>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(2)}>
        <View className="gap-3">
          <CodeInput
            label={t('resetCode.codeLabel')}
            value={code}
            onChangeText={(value) => {
              setCode(value);
              setProblem(null);
            }}
            invalid={refused}
            onSubmitEditing={() => {
              if (isVerificationCode(code)) next();
            }}
          />
          {message ? (
            <Text variant="small" tone="danger" role="alert" accessibilityLiveRegion="polite">
              {message}
            </Text>
          ) : resent ? (
            <Text variant="small" tone="success" accessibilityLiveRegion="polite">
              {t('resetCode.resent')}
            </Text>
          ) : null}
          <View className="items-center">
            {secondsLeft > 0 ? (
              <Text variant="callout" tone="subtle" className="py-3">
                <Trans
                  i18nKey="resetCode.resendIn"
                  values={{ time: formatDuration(secondsLeft) }}
                  components={{
                    strong: <Text variant="labelSmall" style={{ fontVariant: ['tabular-nums'] }} />,
                  }}
                />
              </Text>
            ) : (
              <TextButton tone="primary" label={t('resetCode.resend')} onPress={resend} />
            )}
          </View>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(3)}>
        <View className="gap-4">
          <NoticeBox icon="info">{t('resetCode.hint')}</NoticeBox>
          {canOpenMailApp ? (
            <Button
              variant="secondary"
              label={t('verifyEmail.openMail')}
              leading={<Icon name="mail" color={color.fg} size={size.iconMd} />}
              onPress={openMailApp}
            />
          ) : null}
        </View>
      </Reveal>
    </StepLayout>
  );
}
