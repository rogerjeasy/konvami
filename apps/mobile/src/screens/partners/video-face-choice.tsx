import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/card';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { NoticeBox } from '@/components/notice-box';
import { OptionCard } from '@/components/option-card';
import { Text } from '@/components/text';
import { stepFeedback } from '@/lib/haptics';
import { useProfileServices, useVideoAvatars } from '@/profile/services';

/**
 * The partner's face during calls, in Persona Studio's Look part (6.6; spec §6.20 P2): the drawn
 * portrait, or a realistic face from the video avatar vendor. Shown only where the server offers
 * a vendor, which it does not until one is set up (design note 2026-11-20-avatar-art-video). The
 * first face picked asks for the agreement to the vendor, naming what it receives.
 */
export function VideoFaceChoice({ personaId, name }: { personaId: string; name: string }) {
  const { t } = useTranslation();
  const { videoAvatars, chooseVideoAvatar } = useProfileServices();
  const state = useVideoAvatars();
  const [asking, setAsking] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void videoAvatars.load();
  }, [videoAvatars]);

  if (state.phase !== 'ready' || !state.data.offered) return null;
  const { data } = state;
  const chosen = data.chosen.find((pick) => pick.personaId === personaId)?.faceId ?? null;

  async function choose(faceId: string | null, agreed = false) {
    setFailed(false);
    if (faceId !== null && !data.consent && !agreed) {
      setAsking(faceId);
      return;
    }
    stepFeedback();
    setSaving(true);
    try {
      await chooseVideoAvatar(personaId, faceId, agreed);
      setAsking(null);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const vendor = data.vendor;
  return (
    <Card className="gap-3 p-4">
      <View className="gap-1">
        <Text variant="labelMedium" accessibilityRole="header">
          {t('partners.studio.look.video.title')}
        </Text>
        <Text variant="small" tone="muted">
          {t('partners.studio.look.video.body', { vendor, name })}
        </Text>
      </View>
      {data.allowed ? (
        <View accessibilityRole="radiogroup" className="gap-2.5">
          <OptionCard
            role="radio"
            label={t('partners.studio.look.video.drawn')}
            description={t('partners.studio.look.video.drawnHint')}
            selected={chosen === null}
            disabled={saving}
            onPress={() => void choose(null)}
          />
          {data.faces.map((face) => (
            <OptionCard
              key={face.id}
              role="radio"
              label={face.name}
              selected={chosen === face.id}
              disabled={saving}
              onPress={() => void choose(face.id)}
            />
          ))}
        </View>
      ) : (
        <NoticeBox icon="info">{t('partners.studio.look.video.notAllowed')}</NoticeBox>
      )}
      {failed ? (
        <View accessibilityLiveRegion="polite">
          <NoticeBox icon="info">{t('partners.studio.look.video.failed')}</NoticeBox>
        </View>
      ) : null}
      <ConfirmSheet
        visible={asking !== null}
        title={t('partners.studio.look.video.consentTitle', { vendor })}
        body={t('partners.studio.look.video.consentBody', { vendor, name })}
        confirmLabel={t('partners.studio.look.video.agree')}
        cancelLabel={t('partners.studio.look.video.cancel')}
        loading={saving}
        onConfirm={() => void choose(asking, true)}
        onCancel={() => setAsking(null)}
      />
    </Card>
  );
}
