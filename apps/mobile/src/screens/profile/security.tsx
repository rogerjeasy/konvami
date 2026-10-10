import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { authErrorCode, generalErrorKey, useAuthServices, useSession } from '@/auth';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ListGroup, ListRow } from '@/components/list';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { ProfilePage } from './page';

/**
 * 6.8 Security: the password and the email the learner signs in with, and a way to end every
 * session at once (a lost phone, a shared computer).
 */
export function SecurityScreen() {
  const { t } = useTranslation();
  const { session } = useAuthServices();
  const { user } = useSession();
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function signOutEverywhere() {
    setProblem(null);
    setLeaving(true);
    try {
      await session.signOutEverywhere();
      router.replace(ROUTES.welcome);
    } catch (error) {
      setLeaving(false);
      setAsking(false);
      setProblem(t(generalErrorKey(authErrorCode(error))));
    }
  }

  return (
    <ProfilePage title={t('profile.security.title')} stay={leaving}>
      <Reveal delay={staggerDelay(1)}>
        <ListGroup>
          <ListRow
            icon="key"
            title={t('profile.security.password')}
            detail={t('profile.security.passwordHint')}
            onPress={() => router.push(ROUTES.accountPassword)}
          />
          <ListRow
            icon="mail"
            title={t('profile.security.email')}
            value={user?.email}
            onPress={() => router.push(ROUTES.accountEmail)}
          />
        </ListGroup>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <View className="gap-3">
          <ListGroup>
            <ListRow
              icon="logOut"
              title={t('profile.security.everywhere')}
              detail={t('profile.security.everywhereHint')}
              onPress={() => setAsking(true)}
            />
          </ListGroup>
          {problem ? (
            <NoticeBox icon="alert" tone="danger">
              {problem}
            </NoticeBox>
          ) : null}
        </View>
      </Reveal>
      <ConfirmSheet
        visible={asking}
        title={t('profile.security.everywhereTitle')}
        body={t('profile.security.everywhereBody')}
        confirmLabel={t('profile.security.everywhereYes')}
        cancelLabel={t('profile.security.cancel')}
        loading={leaving}
        onConfirm={signOutEverywhere}
        onCancel={() => setAsking(false)}
      />
    </ProfilePage>
  );
}
