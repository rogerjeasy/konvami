import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { PersonaVoice } from '@konvami/api-client';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { OptionCard } from '@/components/option-card';
import { Text } from '@/components/text';
import { stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { SPEEDS, VOICES } from '@/profile/persona-draft';
import { useProfileServices } from '@/profile/services';
import { useTheme } from '@/theme';
import type { SectionProps } from './shared';

/** A voice's name as shown: the provider's own name for it, capitalised. Never translated. */
export const voiceName = (voice: PersonaVoice) => voice.charAt(0).toUpperCase() + voice.slice(1);

/** The round button that plays or stops one voice's sample. */
function SampleButton({
  voice,
  state,
  onPress,
}: {
  voice: PersonaVoice;
  state: 'idle' | 'loading' | 'playing';
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const name = voiceName(voice);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(
        state === 'playing' ? 'partners.studio.voice.stop' : 'partners.studio.voice.play',
        { voice: name },
      )}
      accessibilityState={{ busy: state === 'loading' }}
      disabled={state === 'loading'}
      onPress={onPress}
      style={{ width: size.headerButton, height: size.headerButton }}
      className={`items-center justify-center rounded-pill border active:opacity-pressed ${
        state === 'playing' ? 'border-primary bg-primary-soft' : 'border-border bg-chip'
      }`}
    >
      {state === 'loading' ? (
        <ActivityIndicator color={color.primary} />
      ) : (
        <Icon
          name={state === 'playing' ? 'stop' : 'play'}
          color={state === 'playing' ? color.primaryText : color.fg}
          size={size.iconMd}
        />
      )}
    </Pressable>
  );
}

/**
 * How the partner sounds (spec §6.2 B): each voice with a sample to listen to before choosing,
 * and how fast they speak.
 */
export function VoiceSection({ draft, change }: SectionProps) {
  const { t, i18n } = useTranslation();
  const { samples, voiceSample } = useProfileServices();
  const [loading, setLoading] = useState<PersonaVoice | null>(null);
  const [playing, setPlaying] = useState<PersonaVoice | null>(null);
  const [failed, setFailed] = useState(false);

  // Leaving this part (another part, another screen) ends what is playing.
  useEffect(() => () => samples.stop(), [samples]);

  async function toggle(voice: PersonaVoice) {
    setFailed(false);
    if (playing === voice) {
      samples.stop();
      return;
    }
    setLoading(voice);
    try {
      const url = await voiceSample(voice);
      samples.play(url, () => setPlaying((current) => (current === voice ? null : current)));
      setPlaying(voice);
    } catch {
      setFailed(true);
    } finally {
      setLoading(null);
    }
  }

  const speedLabel = (speed: number | null) =>
    speed === null
      ? t('partners.studio.voice.speeds.auto')
      : t('partners.studio.voice.speeds.value', {
          speed: new Intl.NumberFormat(i18n.language).format(speed),
        });

  return (
    <>
      <Reveal delay={staggerDelay(1)}>
        <View className="gap-2.5">
          <View accessibilityRole="radiogroup" className="gap-2.5">
            {VOICES.map((voice) => (
              <View key={voice} className="flex-row items-center gap-2.5">
                <SampleButton
                  voice={voice}
                  state={loading === voice ? 'loading' : playing === voice ? 'playing' : 'idle'}
                  onPress={() => void toggle(voice)}
                />
                <View className="flex-1">
                  <OptionCard
                    role="radio"
                    label={voiceName(voice)}
                    selected={draft.voice === voice}
                    onPress={() => {
                      stepFeedback();
                      change({ voice });
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
          {failed ? <NoticeBox icon="info">{t('partners.studio.voice.failed')}</NoticeBox> : null}
        </View>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <View className="gap-1">
          <ChoiceGroup chips label={t('partners.studio.voice.speed')}>
            {SPEEDS.map((speed) => (
              <ChoiceChip
                key={speed ?? 'auto'}
                label={speedLabel(speed)}
                selected={draft.teaching.speed === speed}
                onPress={() => {
                  stepFeedback();
                  change({ teaching: { ...draft.teaching, speed } });
                }}
              />
            ))}
          </ChoiceGroup>
          {draft.teaching.speed === null ? (
            <Text variant="small" tone="subtle">
              {t('partners.studio.voice.speeds.autoHint')}
            </Text>
          ) : null}
        </View>
      </Reveal>
    </>
  );
}
