import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { authErrorCode, generalErrorKey, useAuthServices } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Icon } from '@/components/icon';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { PasswordField } from '@/components/text-field';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { useProfileServices } from '@/profile/services';
import { useTheme } from '@/theme';
import { ProfilePage } from './page';

/** What goes with the account, in the order the learner would think of it. */
const DELETED = ['account', 'profile', 'partners', 'conversations', 'photo'] as const;

type Failure = { on: 'password' | 'form'; message: string };

/**
 * 6.9 Delete account (spec §6.19, Apple guideline 5.1.1(v)): what is deleted, the password as
 * proof, and a last question. The deletion is real and happens at once.
 */
export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { session } = useAuthServices();
  const { deleteAccount } = useProfileServices();
  const [password, setPassword] = useState('');
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [gone, setGone] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function remove() {
    setFailure(null);
    setDeleting(true);
    try {
      // The server deletes an account only for a token from a sign-in made moments ago.
      await session.reauthenticate(password);
    } catch (error) {
      const reason = authErrorCode(error);
      setFailure(
        reason === 'notAuthorized'
          ? { on: 'password', message: t('profile.delete.wrong') }
          : { on: 'form', message: t(generalErrorKey(reason)) },
      );
      setDeleting(false);
      setAsking(false);
      return;
    }
    try {
      await deleteAccount();
    } catch {
      setFailure({ on: 'form', message: t('profile.delete.failed') });
      setDeleting(false);
      setAsking(false);
      return;
    }
    // The account is gone: nothing is left to sign out of on the server.
    setGone(true);
    await session.forget();
    router.replace(ROUTES.welcome);
  }

  return (
    <ProfilePage
      title={t('profile.delete.title')}
      body={t('profile.delete.body')}
      backTo={ROUTES.accountPrivacy}
      stay={gone}
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
            variant="danger"
            label={t('profile.delete.submit')}
            disabled={password.length === 0}
            onPress={() => setAsking(true)}
          />
        </>
      }
    >
      <Reveal delay={staggerDelay(1)}>
        <Card className="gap-3 p-4">
          <Text variant="overline" tone="subtle">
            {t('profile.delete.what')}
          </Text>
          {DELETED.map((item) => (
            <View key={item} className="flex-row items-center gap-3">
              <Icon name="trash" color={color.fgSubtle} size={size.icon} />
              <Text variant="callout" className="flex-1">
                {t(`profile.delete.items.${item}`)}
              </Text>
            </View>
          ))}
        </Card>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <View className="gap-1.5">
          <PasswordField
            label={t('profile.delete.password')}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setFailure(null);
            }}
            error={failure?.on === 'password' ? failure.message : undefined}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
          />
          {failure?.on === 'password' ? null : (
            <Text variant="small" tone="subtle">
              {t('profile.delete.passwordHint')}
            </Text>
          )}
        </View>
      </Reveal>
      <ConfirmSheet
        visible={asking}
        danger
        title={t('profile.delete.confirmTitle')}
        body={t('profile.delete.confirmBody')}
        confirmLabel={t('profile.delete.confirmYes')}
        cancelLabel={t('profile.delete.confirmNo')}
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setAsking(false)}
      />
    </ProfilePage>
  );
}
