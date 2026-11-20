import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PronunciationAttempt } from '@konvami/api-client';
import { Text, type TextTone } from '@/components/text';
import { formatScore } from '@/lib/format';

export type SoundScore = NonNullable<PronunciationAttempt['soundScore']>;
export type SoundBand = SoundScore['band'];

// A band's look. A sound still to practise is amber, never red (spec §14.3).
const BAND_LOOK: Record<SoundBand, { box: string; tone: TextTone }> = {
  good: { box: 'bg-success-soft', tone: 'success' },
  close: { box: 'bg-surface-raised', tone: 'fg' },
  practise: { box: 'bg-warn-soft', tone: 'warn' },
};

/**
 * How a drill's sound went, from the acoustic provider's phoneme scores: the band in words, the
 * score out of 100, and the word to say again first. When no phoneme of the sound came back,
 * the score is from the words that carry it, and the card says so.
 */
export function SoundScoreCard({ title, score }: { title: string; score: SoundScore }) {
  const { t, i18n } = useTranslation();
  const look = BAND_LOOK[score.band];
  return (
    <View className={`gap-1 rounded-card p-4 ${look.box}`}>
      <Text variant="labelMedium" tone={look.tone}>
        {t(`pronunciation.soundScore.band.${score.band}`, { sound: title })}
      </Text>
      <Text variant="heading">
        {t('pronunciation.soundScore.outOf', {
          score: formatScore(i18n.language, score.score),
        })}
      </Text>
      {score.band !== 'good' ? (
        <Text variant="small">{t('pronunciation.soundScore.again', { word: score.weakest })}</Text>
      ) : null}
      {score.basis === 'words' ? (
        <Text variant="caption" tone="muted">
          {t('pronunciation.soundScore.fromWords')}
        </Text>
      ) : null}
    </View>
  );
}
