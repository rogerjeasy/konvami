import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { authErrorCode, generalErrorKey, useAuthServices } from '@/auth';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { IconTile } from '@/components/icon-tile';
import { Link } from '@/components/link';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { isEmail } from '@/lib/validation';
import { useTheme } from '@/theme';
import { useAccessDraft } from './draft';

/**
 * 3.5 Forgot password: the user gives their email and gets a reset code. The answer is the same
 * whether or not the email has an account, so the screen cannot be used to look people up.
 */
export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { provider } = useAuthServices();
  const { draft, update } = useAccessDraft();
  const [email, setEmail] = useState(draft.email);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const toSignIn = () => backOr(ROUTES.signIn);

  async function send() {
    commitFeedback();
    setProblem(null);
    setSending(true);
    try {
      await provider.requestPasswordReset(email.trim());
      update({ email: email.trim(), code: '', codeRefused: false });
      router.push(ROUTES.resetCode);
    } catch (error) {
      setProblem(t(generalErrorKey(authErrorCode(error))));
    } finally {
      setSending(false);
    }
  }

  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row">
          <HeaderButton icon="chevronLeft" label={t('common.back')} onPress={toSignIn} />
        </View>
      }
      actions={
        <>
          {problem ? (
            <View className="pb-2">
              <NoticeBox icon="alert" tone="danger">
                {problem}
              </NoticeBox>
            </View>
          ) : null}
          <Button
            label={t('forgotPassword.submit')}
            disabled={!isEmail(email)}
            loading={sending}
            onPress={send}
          />
          <Text variant="bodySmall" tone="muted" className="py-3 text-center">
            {t('forgotPassword.remembered')}{' '}
            <Link variant="labelMedium" onPress={toSignIn}>
              {t('forgotPassword.backToSignIn')}
            </Link>
          </Text>
        </>
      }
    >
      <Reveal>
        <View className="gap-2.5">
          <View className="pb-2.5">
            <IconTile icon="key" />
          </View>
          <Text variant="title" accessibilityRole="header">
            {t('forgotPassword.title')}
          </Text>
          <Text tone="muted">{t('forgotPassword.body')}</Text>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(1)}>
        <TextField
          label={t('forgotPassword.email')}
          value={email}
          onChangeText={setEmail}
          leading={<Icon name="mail" color={color.fgSubtle} size={size.iconMd} />}
          keyboardType="email-address"
          inputMode="email"
          autoComplete="email"
          textContentType="emailAddress"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={() => {
            if (isEmail(email) && !sending) void send();
          }}
        />
      </Reveal>
    </StepLayout>
  );
}
