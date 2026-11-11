import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PronunciationAttempt } from '@konvami/api-client';
import { Text } from '@/components/text';

/** Only genuine acoustic-provider fields are rendered; unsupported prosody stays absent. */
export function AssessmentResult({
  assessment,
}: {
  assessment: NonNullable<PronunciationAttempt['assessment']>;
}) {
  const { t, i18n } = useTranslation();
  const score = (value: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(value);
  return (
    <View className="gap-2 rounded-card bg-surface-raised p-4">
      <Text variant="labelMedium">{t('pronunciation.assessment.title')}</Text>
      <Text variant="small">
        {t('pronunciation.assessment.accuracy', { score: score(assessment.accuracy) })}
      </Text>
      {assessment.fluency !== null ? (
        <Text variant="small">
          {t('pronunciation.assessment.fluency', { score: score(assessment.fluency) })}
        </Text>
      ) : null}
      {assessment.prosody !== null ? (
        <Text variant="small">
          {t('pronunciation.assessment.prosody', { score: score(assessment.prosody) })}
        </Text>
      ) : null}
      {assessment.words.map((word, index) => (
        <View key={`${index}:${word.word}`} className="gap-1">
          <Text variant="labelMedium">
            {word.word} · {score(word.accuracy)}
          </Text>
          <Text variant="small" tone="muted">
            {word.phonemes.map((phone) => `${phone.phoneme} ${score(phone.accuracy)}`).join(' · ')}
          </Text>
        </View>
      ))}
      <Text variant="caption" tone="subtle">
        {t('pronunciation.assessment.provider', { provider: assessment.provider })}
      </Text>
    </View>
  );
}
