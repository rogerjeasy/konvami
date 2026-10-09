import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { authErrorCode, generalErrorKey, useAuthServices } from '@/auth';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PasswordStrength } from '@/components/password-strength';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';
import { PasswordField } from '@/components/text-field';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { isValidPassword } from '@/lib/validation';
import { useTheme } from '@/theme';
import { useAccessDraft } from './draft';

/**
 * 3.7 New password: the user chooses a new password (entered twice) and whether to sign out their
 * other devices. The service checks the reset code and the password together; a refused code
 * sends the user back to enter it again.
 */
export function NewPasswordScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { session } = useAuthServices();
  const { draft, update } = useAccessDraft();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // On by default, as drawn: after a reset, the old password may be known to someone else.
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ on: 'password' | 'form'; message: string } | null>(null);
  /** Set once the flow has moved on, so clearing the draft does not bounce this screen back. */
  const [finished, setFinished] = useState(false);

  // No reset in progress (a deep link, a reload on web): start from the beginning.
  if ((!draft.email || !draft.code) && !finished) return <Redirect href={ROUTES.forgotPassword} />;
  const { email, code } = draft;

  const matches = confirm.length > 0 && confirm === password;
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = isValidPassword(password) && matches;

  async function save() {
    commitFeedback();
    setFailure(null);
    setSaving(true);
    try {
      await session.resetPassword({ email, code, newPassword: password, signOutOthers });
      setFinished(true);
      // Only what the last screen needs survives; the code has done its job.
      update({ code: '', codeRefused: false, signedOutOthers: signOutOthers });
      router.replace(ROUTES.passwordUpdated);
    } catch (error) {
      const reason = authErrorCode(error);
      if (reason === 'invalidCode' || reason === 'expiredCode') {
        update({ code: '', codeRefused: true });
        backOr(ROUTES.resetCode);
      } else if (reason === 'passwordReused') {
        setFailure({ on: 'password', message: t('newPassword.reused') });
      } else if (reason === 'invalidPassword') {
        setFailure({ on: 'password', message: t('emailSignUp.invalidPassword') });
      } else {
        setFailure({ on: 'form', message: t(generalErrorKey(reason)) });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row">
          <HeaderButton
            icon="close"
            label={t('common.close')}
            onPress={() => router.replace(ROUTES.signIn)}
          />
        </View>
      }
      actions={
        <>
          {failure?.on === 'form' ? (
            <View className="pb-2">
              <NoticeBox icon="alert" tone="danger">
                {failure.message}
              </NoticeBox>
            </View>
          ) : null}
          <Button
            label={t('newPassword.submit')}
            disabled={!valid}
            loading={saving}
            onPress={save}
          />
        </>
      }
    >
      <Reveal>
        <View className="gap-2">
          <Text variant="title" accessibilityRole="header">
            {t('newPassword.title')}
          </Text>
          <Text tone="muted">
            <Trans
              i18nKey="newPassword.body"
              values={{ email }}
              components={{ strong: <Text variant="label" /> }}
            />
          </Text>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(1)}>
        <View className="gap-4">
          <View className="gap-3">
            <PasswordField
              label={t('newPassword.password')}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setFailure(null);
              }}
              error={failure?.on === 'password' ? failure.message : undefined}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
            />
            <PasswordStrength password={password} />
          </View>
          <View className="gap-1.5">
            <PasswordField
              label={t('newPassword.confirm')}
              value={confirm}
              onChangeText={setConfirm}
              error={mismatch ? t('emailSignUp.passwordsDontMatch') : undefined}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
            />
            {matches ? (
              <View className="flex-row items-center gap-1.5">
                <Icon name="check" color={color.success} size={size.iconSm} strokeWidth={3} />
                <Text variant="small" tone="success" accessibilityLiveRegion="polite">
                  {t('newPassword.match')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(2)}>
        <View className="flex-row items-center gap-3.5">
          <View className="flex-1" aria-hidden>
            <Text variant="labelMedium">{t('newPassword.signOutOthers')}</Text>
            <Text variant="small" tone="subtle">
              {t('newPassword.signOutOthersHint')}
            </Text>
          </View>
          <Switch
            label={t('newPassword.signOutOthers')}
            value={signOutOthers}
            onValueChange={setSignOutOthers}
          />
        </View>
      </Reveal>
    </StepLayout>
  );
}
