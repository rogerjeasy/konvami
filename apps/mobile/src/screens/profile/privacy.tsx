import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  authErrorCode,
  generalErrorKey,
  useAuthServices,
  useSession,
  type AiConsentChoices,
} from '@/auth';
import { AiProviderList } from '@/components/ai-provider-list';
import { Card } from '@/components/card';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ListGroup, ListRow } from '@/components/list';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { openLegal } from '@/lib/external';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { useProfileServices, useRecordings } from '@/profile/services';
import { ProfilePage } from './page';

// Someone who has not answered the consent screen yet has agreed to nothing optional.
const NOTHING_OPTIONAL: AiConsentChoices = { elevenlabs: false, bedrock: false };

/**
 * Whether the audio of conversations is kept (spec §6.6). Stopping deletes every recording kept
 * so far, so it is asked first; keeping them again is not.
 */
function RecordingsChoice() {
  const { t } = useTranslation();
  const { recordings, keepRecordings } = useProfileServices();
  const state = useRecordings();
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void recordings.load();
  }, [recordings]);

  async function keep(kept: boolean) {
    setSaving(true);
    setError(null);
    try {
      await keepRecordings(kept);
      setAsking(false);
    } catch (failure) {
      setAsking(false);
      setError(t(apiErrorKey(apiErrorCode(failure))));
    } finally {
      setSaving(false);
    }
  }

  if (state.phase === 'failed') {
    return (
      <View className="gap-1">
        <NoticeBox icon="alert" tone="danger">
          {t('profile.privacy.recordings.loadFailed')}
        </NoticeBox>
        <TextButton
          tone="primary"
          label={t('common.retry')}
          onPress={() => void recordings.reload()}
        />
      </View>
    );
  }
  if (state.phase !== 'ready') return null;
  const kept = state.data.kept;
  return (
    <View className="gap-3">
      <Card className="flex-row items-center gap-3 p-3.5">
        <View className="flex-1 gap-1">
          <Text variant="labelMedium">{t('profile.privacy.recordings.label')}</Text>
          <Text variant="small" tone="muted">
            {t(kept ? 'profile.privacy.recordings.on' : 'profile.privacy.recordings.off')}
          </Text>
        </View>
        <Switch
          label={t('profile.privacy.recordings.label')}
          value={kept}
          locked={saving}
          onValueChange={(on) => (on ? void keep(true) : setAsking(true))}
        />
      </Card>
      {error ? (
        <View accessibilityLiveRegion="polite">
          <NoticeBox icon="alert" tone="danger">
            {error}
          </NoticeBox>
        </View>
      ) : null}
      <ConfirmSheet
        visible={asking}
        title={t('profile.privacy.recordings.confirmTitle')}
        body={t('profile.privacy.recordings.confirmBody')}
        confirmLabel={t('profile.privacy.recordings.confirm')}
        cancelLabel={t('profile.privacy.recordings.cancel')}
        danger
        loading={saving}
        onConfirm={() => void keep(false)}
        onCancel={() => setAsking(false)}
      />
    </View>
  );
}

/**
 * 6.7 Privacy and AI (spec §6.19): which AI providers may receive the learner's data, changed
 * at any time and stored on the account at once, with its date; whether recordings are kept;
 * and the way to delete the account.
 */
export function PrivacyScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuthServices();
  const { user } = useSession();
  const stored = user?.aiConsent?.providers;
  const [choices, setChoices] = useState<AiConsentChoices>(
    stored ? { elevenlabs: stored.elevenlabs, bedrock: stored.bedrock } : NOTHING_OPTIONAL,
  );
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function change(next: AiConsentChoices) {
    const before = choices;
    setChoices(next);
    setResult(null);
    setSaving(true);
    try {
      await session.saveAiConsent(next);
      setResult({ ok: true, message: t('profile.privacy.saved') });
    } catch (error) {
      // The switch shows what the account holds, so it goes back.
      setChoices(before);
      setResult({ ok: false, message: t(generalErrorKey(authErrorCode(error))) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProfilePage title={t('profile.privacy.title')} body={t('profile.privacy.body')}>
      <Reveal delay={staggerDelay(1)}>
        <View className="gap-3">
          <AiProviderList choices={choices} onChange={change} disabled={saving} />
          {result ? (
            <View accessibilityLiveRegion="polite">
              <NoticeBox
                icon={result.ok ? 'check' : 'alert'}
                tone={result.ok ? 'primary' : 'danger'}
              >
                {result.message}
              </NoticeBox>
            </View>
          ) : (
            <NoticeBox icon="info">{t('profile.privacy.note')}</NoticeBox>
          )}
          <TextButton
            tone="primary"
            label={t('aiConsent.readNotice')}
            onPress={() => openLegal('privacy', i18n.language)}
          />
        </View>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <RecordingsChoice />
      </Reveal>
      <Reveal delay={staggerDelay(3)}>
        <ListGroup>
          <ListRow
            icon="trash"
            tone="danger"
            title={t('profile.privacy.delete')}
            detail={t('profile.privacy.deleteHint')}
            onPress={() => router.push(ROUTES.accountDelete)}
          />
        </ListGroup>
      </Reveal>
    </ProfilePage>
  );
}
