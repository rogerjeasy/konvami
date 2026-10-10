import { useState } from 'react';
import { View } from 'react-native';
import { Trans, useTranslation } from 'react-i18next';
import { authErrorCode, generalErrorKey, useAuthServices, useSession } from '@/auth';
import { Button } from '@/components/button';
import { CodeInput } from '@/components/code-input';
import { IconTile } from '@/components/icon-tile';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextField } from '@/components/text-field';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { isEmail, isVerificationCode } from '@/lib/validation';
import { ProfileDone, ProfilePage } from './page';

type Failure = { on: 'field' | 'form'; message: string };

/**
 * 6.8 Security: change email. The account keeps its address until the code sent to the new
 * one is entered, so a typo can never lock the learner out.
 */
export function ChangeEmailScreen() {
  const { t } = useTranslation();
  const { session } = useAuthServices();
  const { user } = useSession();
  const [step, setStep] = useState<'address' | 'code' | 'done'>('address');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const wanted = email.trim().toLowerCase();

  async function sendCode() {
    commitFeedback();
    setFailure(null);
    if (wanted === user?.email.toLowerCase()) {
      setFailure({ on: 'field', message: t('profile.email.same') });
      return;
    }
    setWorking(true);
    try {
      await session.requestEmailChange(wanted);
      setCode('');
      setStep('code');
    } catch (error) {
      const reason = authErrorCode(error);
      setFailure(
        reason === 'emailTaken'
          ? { on: 'field', message: t('profile.email.taken') }
          : { on: 'form', message: t(generalErrorKey(reason)) },
      );
    } finally {
      setWorking(false);
    }
  }

  async function confirm() {
    commitFeedback();
    setFailure(null);
    setWorking(true);
    try {
      await session.confirmEmailChange(code);
      successFeedback();
      setStep('done');
    } catch (error) {
      const reason = authErrorCode(error);
      if (reason === 'invalidCode' || reason === 'expiredCode') {
        setCode('');
        setFailure({ on: 'field', message: t(`verifyEmail.${reason}`) });
      } else if (reason === 'emailTaken') {
        setFailure({ on: 'field', message: t('profile.email.taken') });
      } else {
        setFailure({ on: 'form', message: t(generalErrorKey(reason)) });
      }
    } finally {
      setWorking(false);
    }
  }

  if (step === 'done') {
    return <ProfileDone message={t('profile.email.done')} backTo={ROUTES.accountSecurity} />;
  }

  const problem =
    failure?.on === 'form' ? (
      <View className="pb-2">
        <NoticeBox icon="alert" tone="danger">
          {failure.message}
        </NoticeBox>
      </View>
    ) : null;

  if (step === 'code') {
    return (
      <ProfilePage
        // A new page for the reader, so its title is read out and its entrance plays.
        key="code"
        title={t('profile.email.codeTitle')}
        lead={<IconTile icon="mail" />}
        backTo={ROUTES.accountSecurity}
        actions={
          <>
            {problem}
            <Button
              label={t('profile.email.confirm')}
              disabled={!isVerificationCode(code)}
              loading={working}
              onPress={confirm}
            />
            <TextButton
              label={t('profile.email.otherAddress')}
              onPress={() => {
                setFailure(null);
                setStep('address');
              }}
            />
          </>
        }
      >
        <Reveal delay={staggerDelay(1)}>
          <Text tone="muted">
            <Trans
              i18nKey="profile.email.codeBody"
              values={{ email: wanted }}
              components={{ strong: <Text variant="label" /> }}
            />
          </Text>
        </Reveal>
        <Reveal delay={staggerDelay(2)}>
          <View className="gap-2">
            <CodeInput
              label={t('verifyEmail.codeLabel')}
              value={code}
              onChangeText={(next) => {
                setCode(next);
                setFailure(null);
              }}
              invalid={failure?.on === 'field'}
              autoFocus
              onSubmitEditing={() => {
                if (isVerificationCode(code) && !working) void confirm();
              }}
            />
            {failure?.on === 'field' ? (
              <Text variant="small" tone="danger" role="alert" accessibilityLiveRegion="polite">
                {failure.message}
              </Text>
            ) : null}
          </View>
        </Reveal>
      </ProfilePage>
    );
  }

  return (
    <ProfilePage
      key="address"
      title={t('profile.email.title')}
      body={t('profile.email.body')}
      backTo={ROUTES.accountSecurity}
      actions={
        <>
          {problem}
          <Button
            label={t('profile.email.send')}
            disabled={!isEmail(email)}
            loading={working}
            onPress={sendCode}
          />
        </>
      }
    >
      <Reveal delay={staggerDelay(1)}>
        <View className="gap-4">
          <Text variant="labelSmall" tone="muted">
            {t('profile.email.current', { email: user?.email ?? '' })}
          </Text>
          <TextField
            label={t('profile.email.new')}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setFailure(null);
            }}
            error={failure?.on === 'field' ? failure.message : undefined}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={() => {
              if (isEmail(email) && !working) void sendCode();
            }}
          />
        </View>
      </Reveal>
    </ProfilePage>
  );
}
