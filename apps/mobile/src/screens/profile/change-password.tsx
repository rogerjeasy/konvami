import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { authErrorCode, generalErrorKey, useAuthServices } from '@/auth';
import { Button } from '@/components/button';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PasswordStrength } from '@/components/password-strength';
import { PasswordField } from '@/components/text-field';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { isValidPassword } from '@/lib/validation';
import { ProfileDone, ProfilePage } from './page';

type Failure = { on: 'current' | 'next' | 'form'; message: string };

/**
 * 6.8 Security: change password. The current password proves it is the learner; the new one
 * follows the same rules as at sign-up, shown as they are met.
 */
export function ChangePasswordScreen() {
  const { t } = useTranslation();
  const { session } = useAuthServices();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const mismatch = again.length > 0 && again !== next;
  const valid = current.length > 0 && isValidPassword(next) && again === next;

  async function save() {
    commitFeedback();
    setFailure(null);
    setSaving(true);
    try {
      await session.changePassword(current, next);
      successFeedback();
      setDone(true);
    } catch (error) {
      const reason = authErrorCode(error);
      if (reason === 'notAuthorized') {
        setFailure({ on: 'current', message: t('profile.password.wrong') });
      } else if (reason === 'passwordReused') {
        setFailure({ on: 'next', message: t('newPassword.reused') });
      } else if (reason === 'invalidPassword') {
        setFailure({ on: 'next', message: t('emailSignUp.invalidPassword') });
      } else {
        setFailure({ on: 'form', message: t(generalErrorKey(reason)) });
      }
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return <ProfileDone message={t('profile.password.done')} backTo={ROUTES.accountSecurity} />;
  }

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    setFailure(null);
  };

  return (
    <ProfilePage
      title={t('profile.password.title')}
      body={t('profile.password.body')}
      backTo={ROUTES.accountSecurity}
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
            label={t('profile.password.submit')}
            disabled={!valid}
            loading={saving}
            onPress={save}
          />
        </>
      }
    >
      <Reveal delay={staggerDelay(1)}>
        <PasswordField
          label={t('profile.password.current')}
          value={current}
          onChangeText={edit(setCurrent)}
          error={failure?.on === 'current' ? failure.message : undefined}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
        />
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <View className="gap-4">
          <View className="gap-3">
            <PasswordField
              label={t('newPassword.password')}
              value={next}
              onChangeText={edit(setNext)}
              error={failure?.on === 'next' ? failure.message : undefined}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
            />
            <PasswordStrength password={next} />
          </View>
          <PasswordField
            label={t('newPassword.confirm')}
            value={again}
            onChangeText={edit(setAgain)}
            error={mismatch ? t('emailSignUp.passwordsDontMatch') : undefined}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
          />
        </View>
      </Reveal>
    </ProfilePage>
  );
}
