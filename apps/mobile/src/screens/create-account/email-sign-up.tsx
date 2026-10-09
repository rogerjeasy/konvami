import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { authErrorCode, generalErrorKey, useAuthServices } from '@/auth';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Link } from '@/components/link';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PasswordStrength } from '@/components/password-strength';
import { StepHeader } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';
import { PasswordField, TextField } from '@/components/text-field';
import { isLanguage, DEFAULT_LANGUAGE } from '@/i18n';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { isEmail, isValidPassword } from '@/lib/validation';
import { useTheme } from '@/theme';
import { useSignUpDraft } from './draft';
import { SIGN_UP_STEPS } from './steps';

/** A failure shown on the field it belongs to, or as a general notice above the button. */
type Failure = { on: 'email' | 'password' | 'form'; message: string };

/**
 * 2.3 Sign up with email: first name, email and a password entered twice. The button stays off
 * until everything is valid; the server's answer (email already used, password refused) is shown
 * on the field it concerns.
 */
export function EmailSignUpScreen() {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { provider } = useAuthServices();
  const { draft, update } = useSignUpDraft();
  const [firstName, setFirstName] = useState(draft.firstName);
  const [email, setEmail] = useState(draft.email);
  const [password, setPassword] = useState(draft.password);
  const [confirm, setConfirm] = useState(draft.password);
  const [tipsOptIn, setTipsOptIn] = useState(draft.tipsOptIn);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  /** The email already has an account: sign-in is offered under the field. */
  const [emailTaken, setEmailTaken] = useState(false);

  // Reached without passing the age check (a deep link, a reload on web): start there.
  if (!draft.ageBracket) return <Redirect href={ROUTES.createAccount} />;
  const ageBracket = draft.ageBracket;

  const emailOk = isEmail(email);
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid =
    firstName.trim().length > 0 && emailOk && isValidPassword(password) && confirm === password;

  /** Typing in a field clears the failure shown on it (and any general one). */
  const editing = (field: Failure['on'], set: (value: string) => void) => (value: string) => {
    set(value);
    setFailure((current) =>
      current && current.on !== field && current.on !== 'form' ? current : null,
    );
  };

  async function submit() {
    commitFeedback();
    setFailure(null);
    setEmailTaken(false);
    setSending(true);
    try {
      await provider.signUp({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        locale: isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE,
        ageBracket,
        tipsOptIn,
      });
      update({ firstName: firstName.trim(), email: email.trim(), password, tipsOptIn });
      router.push(ROUTES.verifyEmail);
    } catch (error) {
      const code = authErrorCode(error);
      if (code === 'emailTaken') {
        setFailure({ on: 'email', message: t('emailSignUp.emailTaken') });
        setEmailTaken(true);
      } else if (code === 'invalidPassword') {
        setFailure({ on: 'password', message: t('emailSignUp.invalidPassword') });
      } else {
        setFailure({ on: 'form', message: t(generalErrorKey(code)) });
      }
    } finally {
      setSending(false);
    }
  }

  const failureOn = (field: Failure['on']) => (failure?.on === field ? failure.message : undefined);

  return (
    <StepLayout
      header={
        <StepHeader
          step={SIGN_UP_STEPS.account}
          total={SIGN_UP_STEPS.total}
          onBack={() => router.back()}
        />
      }
      actions={
        <>
          {failure?.on === 'form' ? (
            <View className="pb-2">
              <NoticeBox icon="info" tone="danger">
                {failure.message}
              </NoticeBox>
            </View>
          ) : null}
          <Button
            label={t('emailSignUp.submit')}
            disabled={!valid}
            loading={sending}
            onPress={submit}
          />
        </>
      }
    >
      <Reveal>
        <View className="gap-2">
          <Text variant="title" accessibilityRole="header">
            {t('emailSignUp.title')}
          </Text>
          <Text tone="muted">{t('emailSignUp.body')}</Text>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(1)}>
        <View className="gap-4">
          <TextField
            label={t('emailSignUp.firstName')}
            value={firstName}
            onChangeText={setFirstName}
            autoComplete="given-name"
            textContentType="givenName"
            autoCapitalize="words"
            returnKeyType="next"
          />
          <View className="gap-1.5">
            <TextField
              label={t('emailSignUp.email')}
              value={email}
              onChangeText={editing('email', setEmail)}
              error={failureOn('email')}
              keyboardType="email-address"
              inputMode="email"
              autoComplete="email"
              textContentType="emailAddress"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              trailing={
                emailOk && !failureOn('email') ? (
                  <View
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={t('emailSignUp.emailValid')}
                    className="pr-3"
                  >
                    <Icon name="check" color={color.success} size={size.iconMd} strokeWidth={2.4} />
                  </View>
                ) : undefined
              }
            />
            {emailTaken && failureOn('email') ? (
              <Link variant="labelSmall" onPress={() => router.push(ROUTES.signIn)}>
                {t('createAccount.signIn')}
              </Link>
            ) : null}
          </View>
          <View className="gap-3">
            <PasswordField
              label={t('emailSignUp.password')}
              value={password}
              onChangeText={editing('password', setPassword)}
              error={failureOn('password')}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
            />
            <PasswordStrength password={password} />
          </View>
          <PasswordField
            label={t('emailSignUp.confirmPassword')}
            value={confirm}
            onChangeText={setConfirm}
            error={mismatch ? t('emailSignUp.passwordsDontMatch') : undefined}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
          />
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(2)}>
        <View className="flex-row items-center gap-3.5">
          <View className="flex-1" aria-hidden>
            <Text variant="labelMedium">{t('emailSignUp.tips')}</Text>
            <Text variant="small" tone="subtle">
              {t('emailSignUp.tipsHint')}
            </Text>
          </View>
          <Switch label={t('emailSignUp.tips')} value={tipsOptIn} onValueChange={setTipsOptIn} />
        </View>
      </Reveal>
    </StepLayout>
  );
}
