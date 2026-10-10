import { useState } from 'react';
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
import { ListGroup, ListRow } from '@/components/list';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { TextButton } from '@/components/text-button';
import { openLegal } from '@/lib/external';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { ProfilePage } from './page';

// Someone who has not answered the consent screen yet has agreed to nothing optional.
const NOTHING_OPTIONAL: AiConsentChoices = { elevenlabs: false, bedrock: false };

/**
 * 6.7 Privacy and AI (spec §6.19): which AI providers may receive the learner's data, changed
 * at any time and stored on the account at once, with its date; and the way to delete the
 * account.
 */
export function PrivacyScreen() {
  const { t } = useTranslation();
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
            onPress={() => openLegal('privacy')}
          />
        </View>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
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
