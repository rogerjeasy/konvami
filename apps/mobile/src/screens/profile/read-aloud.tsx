import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { OptionCard } from '@/components/option-card';
import { PlayButton, type PlayState } from '@/components/play-button';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { usePremiumVoices, useProfileServices } from '@/profile/services';
import { useElevenLabsConsent } from '@/profile/use-elevenlabs-consent';
import { ProfilePage } from './page';

/**
 * 6.21 Read-aloud voice (spec §6.21.2): the premium voice (ElevenLabs) that reads cards, the
 * weekly check-in and an exam's model answers aloud. Live conversations keep the partners' own
 * voices. The voices are listed with a sample each, after the learner agreed to ElevenLabs and
 * when they may use premium voices; the standard voice is always one of the choices.
 */
export function ReadAloudScreen() {
  const { t } = useTranslation();
  const { premium, choosePremiumVoice, premiumVoiceSample, samples } = useProfileServices();
  const state = usePremiumVoices();
  const elevenlabs = useElevenLabsConsent();
  const [loading, setLoading] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Leaving the screen ends what is playing.
  useEffect(() => () => samples.stop(), [samples]);

  async function toggle(voiceId: string) {
    setProblem(null);
    if (playing === voiceId) {
      samples.stop();
      return;
    }
    setLoading(voiceId);
    try {
      const url = await premiumVoiceSample(voiceId);
      samples.play(url, () => setPlaying((current) => (current === voiceId ? null : current)));
      setPlaying(voiceId);
    } catch {
      setProblem(t('profile.readAloud.sampleFailed'));
    } finally {
      setLoading(null);
    }
  }

  async function choose(voiceId: string | null) {
    stepFeedback();
    setProblem(null);
    setSaving(true);
    try {
      await choosePremiumVoice(voiceId);
    } catch (failure) {
      setProblem(t(apiErrorKey(apiErrorCode(failure))));
    } finally {
      setSaving(false);
    }
  }

  const page = (children: React.ReactNode) => (
    <ProfilePage title={t('profile.readAloud.title')} body={t('profile.readAloud.body')}>
      {children}
    </ProfilePage>
  );

  if (state.phase === 'failed') {
    return page(
      <View className="gap-1">
        <NoticeBox icon="alert" tone="danger">
          {t('profile.readAloud.loadFailed')}
        </NoticeBox>
        <TextButton
          tone="primary"
          label={t('common.retry')}
          onPress={() => void premium.reload()}
        />
      </View>,
    );
  }
  if (state.phase !== 'ready') return page(null);
  // Nothing to choose where ElevenLabs is not set up: back to the Profile.
  if (!state.data.offered) return <Redirect href={ROUTES.account} />;

  const { data } = state;
  if (!data.consent) {
    return page(
      <Reveal delay={staggerDelay(1)}>
        <Card className="gap-3 p-4">
          <Text variant="labelMedium" accessibilityRole="header">
            {t('profile.readAloud.consentTitle')}
          </Text>
          <Text variant="small" tone="muted">
            {t('profile.readAloud.consentBody')}
          </Text>
          {elevenlabs.error ? (
            <NoticeBox icon="alert" tone="danger">
              {elevenlabs.error}
            </NoticeBox>
          ) : null}
          <Button
            label={t('profile.readAloud.agree')}
            loading={elevenlabs.saving}
            onPress={() => void elevenlabs.set(true)}
          />
        </Card>
      </Reveal>,
    );
  }
  if (!data.allowed) {
    return page(<NoticeBox icon="info">{t('profile.readAloud.notAllowed')}</NoticeBox>);
  }

  return page(
    <Reveal delay={staggerDelay(1)}>
      <View className="gap-2.5">
        <View accessibilityRole="radiogroup" className="gap-2.5">
          <OptionCard
            role="radio"
            label={t('profile.readAloud.standard')}
            description={t('profile.readAloud.standardHint')}
            selected={data.chosen === null}
            disabled={saving}
            onPress={() => void choose(null)}
          />
          {data.voices.map((voice) => {
            const sample: PlayState =
              loading === voice.id ? 'loading' : playing === voice.id ? 'playing' : 'idle';
            return (
              <View key={voice.id} className="flex-row items-center gap-2.5">
                <PlayButton
                  label={t(
                    sample === 'playing' ? 'profile.readAloud.stop' : 'profile.readAloud.play',
                    {
                      voice: voice.name,
                    },
                  )}
                  state={sample}
                  onPress={() => void toggle(voice.id)}
                />
                <View className="flex-1">
                  <OptionCard
                    role="radio"
                    label={voice.name}
                    selected={data.chosen === voice.id}
                    disabled={saving}
                    onPress={() => void choose(voice.id)}
                  />
                </View>
              </View>
            );
          })}
        </View>
        {problem ? (
          <View accessibilityLiveRegion="polite">
            <NoticeBox icon="info">{problem}</NoticeBox>
          </View>
        ) : null}
      </View>
    </Reveal>,
  );
}
