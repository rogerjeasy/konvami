import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { apiErrorCode } from '@/api/messages';
import { authErrorCode, generalErrorKey, useAuthServices, useSession } from '@/auth';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { AppLanguageSheet } from '@/components/language-sheet';
import { ListGroup, ListRow } from '@/components/list';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextField } from '@/components/text-field';
import { UserPhoto } from '@/components/user-photo';
import { LANGUAGE_NATIVE_NAMES } from '@/i18n';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { effectiveLanguage, usePreferences } from '@/preferences';
import { useAccount, useProfileServices } from '@/profile/services';
import { useTheme } from '@/theme';
import { ProfilePage } from './page';

// The longest first name the form takes; the account itself allows more.
const NAME_MAX = 40;

/** The learner's photo with the ways to choose another one or to remove it. */
function Photo({ name }: { name: string }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { account, pictures } = useProfileServices();
  const { pictureUrl } = useAccount();
  const [busy, setBusy] = useState<'choosing' | 'removing' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function choose() {
    commitFeedback();
    setProblem(null);
    setBusy('choosing');
    try {
      const picked = await pictures.pick();
      if (picked.status === 'failed') setProblem(t('profile.personal.photoFailed'));
      if (picked.status !== 'picked') return;
      await account.setPicture(picked.picture);
      successFeedback();
    } catch (error) {
      // A file the server refuses is, to the learner, a picture that cannot be used.
      const refused = apiErrorCode(error) === 'invalid_picture';
      setProblem(t(refused ? 'profile.personal.photoFailed' : 'profile.personal.photoNotSent'));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setProblem(null);
    setBusy('removing');
    try {
      await account.removePicture();
    } catch {
      setProblem(t('errors.unknown'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="items-center gap-4">
      <UserPhoto uri={pictureUrl} name={name} diameter={size.avatarXl} />
      <View className="w-full gap-1">
        <Button
          variant="secondary"
          label={t(pictureUrl ? 'profile.personal.changePhoto' : 'profile.personal.choosePhoto')}
          leading={<Icon name="image" color={color.fg} size={size.iconMd} />}
          loading={busy === 'choosing'}
          disabled={busy === 'removing'}
          onPress={choose}
        />
        {pictureUrl ? (
          <TextButton
            label={t('profile.personal.removePhoto')}
            disabled={busy !== null}
            onPress={remove}
          />
        ) : null}
      </View>
      {problem ? (
        <View className="w-full">
          <NoticeBox icon="alert" tone="danger">
            {problem}
          </NoticeBox>
        </View>
      ) : (
        <Text variant="small" tone="subtle" className="text-center">
          {t('profile.personal.photoNote')}
        </Text>
      )}
    </View>
  );
}

/** The first name, saved on the account: every partner uses it from the next conversation. */
function Name({ current }: { current: string }) {
  const { t } = useTranslation();
  const { session } = useAuthServices();
  const [name, setName] = useState(current);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const changed = name.trim() !== current && name.trim().length > 0;

  async function save() {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      await session.updateName(name);
      setName(name.trim());
      setSaved(true);
      successFeedback();
    } catch (error) {
      setProblem(t(generalErrorKey(authErrorCode(error))));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="gap-3">
      <TextField
        label={t('profile.personal.firstName')}
        value={name}
        onChangeText={(text) => {
          setName(text);
          setSaved(false);
        }}
        maxLength={NAME_MAX}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="done"
        error={problem ?? undefined}
        trailing={
          saved ? (
            <View className="pr-3" accessibilityLiveRegion="polite">
              <Pop>
                <Pill tone="success" label={t('profile.saved')} />
              </Pop>
            </View>
          ) : undefined
        }
      />
      <Button
        variant="secondary"
        label={t('profile.personal.saveName')}
        disabled={!changed}
        loading={saving}
        onPress={save}
      />
    </View>
  );
}

/**
 * 6.2 Personal: the learner's first name and photo, the app's language, and the way to change
 * the email they sign in with.
 */
export function PersonalScreen() {
  const { t } = useTranslation();
  const { session } = useAuthServices();
  const { user } = useSession();
  const { language: picked } = usePreferences();
  const [choosingLanguage, setChoosingLanguage] = useState(false);

  return (
    <ProfilePage title={t('profile.personal.title')} body={t('profile.personal.body')}>
      <Reveal delay={staggerDelay(1)}>
        <Photo name={user?.firstName ?? ''} />
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <Name current={user?.firstName ?? ''} />
      </Reveal>
      <Reveal delay={staggerDelay(3)}>
        <ListGroup>
          <ListRow
            icon="globe"
            title={t('profile.personal.language')}
            value={LANGUAGE_NATIVE_NAMES[effectiveLanguage(picked)]}
            onPress={() => setChoosingLanguage(true)}
          />
          <ListRow
            icon="mail"
            title={t('profile.personal.email')}
            value={user?.email}
            onPress={() => router.push(ROUTES.accountEmail)}
          />
        </ListGroup>
      </Reveal>
      <AppLanguageSheet
        visible={choosingLanguage}
        onClose={() => setChoosingLanguage(false)}
        // The account keeps the language too: the setup guide and emails use it. If that fails,
        // the app still shows the language chosen here.
        onChosen={(language) => void session.updateLanguage(language).catch(() => {})}
      />
    </ProfilePage>
  );
}
