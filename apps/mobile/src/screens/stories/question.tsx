import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { StoryAnswer } from '@konvami/api-client';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { RecordingNow } from '@/components/recording-now';
import { Text } from '@/components/text';
import { successFeedback } from '@/lib/haptics';
import { usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { useSpokenAttempt } from '@/voice/use-spoken-attempt';

/** Why an answer could not be checked, as the card says it. */
const FAILED = {
  mic_denied: 'stories.questions.failed.mic_denied',
  consent_required: 'stories.questions.failed.consent_required',
  network: 'stories.questions.failed.network',
} as const;

const failedKey = (code: string) =>
  code in FAILED ? FAILED[code as keyof typeof FAILED] : 'stories.questions.failed.other';

/**
 * A question about an episode, answered out loud (5.29). What the learner said is written down
 * and checked word for word against the episode's answer; a miss is "not quite yet" with the
 * answer shown, never a red alarm (spec §14.3).
 */
export function StoryQuestion({
  episodeId,
  index,
  question,
  answer,
  earlier,
}: {
  episodeId: string;
  index: number;
  question: string;
  answer: string;
  earlier: StoryAnswer | null;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { answerStoryQuestion } = usePracticeServices();
  const { step, record, stop, reset } = useSpokenAttempt(
    (recording) => answerStoryQuestion(episodeId, index, recording),
    (result) => {
      if (result.right) successFeedback();
    },
  );
  const result = step.kind === 'heard' ? step.result : step.kind === 'ready' ? earlier : null;
  return (
    <View className="gap-3 rounded-card border border-border bg-surface p-4">
      <Text variant="langLine">{question}</Text>
      {result ? (
        <Reveal>
          <View className="gap-1.5" accessibilityLiveRegion="polite">
            {result.right ? (
              <Pop>
                <View className="flex-row items-center gap-2">
                  <Icon name="check" color={color.success} size={size.iconMd} />
                  <Text variant="heading">{t('stories.questions.right')}</Text>
                </View>
              </Pop>
            ) : (
              <Text variant="labelMedium">{t('stories.questions.almost')}</Text>
            )}
            <Text tone="muted">{t('stories.questions.heard', { heard: result.heard })}</Text>
            {result.right ? null : <Text>{t('stories.questions.answer', { answer })}</Text>}
          </View>
        </Reveal>
      ) : null}
      {step.kind === 'recording' ? (
        <RecordingNow
          label={t('stories.questions.recording')}
          hint={t('stories.questions.recordingHint')}
          stopLabel={t('stories.questions.stop')}
          onStop={() => void stop()}
        />
      ) : step.kind === 'checking' ? (
        <Text tone="muted" accessibilityLiveRegion="polite">
          {t('stories.questions.checking')}
        </Text>
      ) : step.kind === 'failed' ? (
        <View className="gap-2">
          <NoticeBox icon="info">{t(failedKey(step.code))}</NoticeBox>
          <Button variant="secondary" label={t('stories.questions.again')} onPress={reset} />
        </View>
      ) : (
        <Button
          variant={result ? 'secondary' : 'primary'}
          label={t(result ? 'stories.questions.again' : 'stories.questions.record')}
          leading={
            <Icon name="mic" color={result ? color.fg : color.onPrimary} size={size.iconMd} />
          }
          onPress={() => {
            if (step.kind === 'heard') reset();
            void record();
          }}
        />
      )}
    </View>
  );
}
