import { useEffect } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { RecordingNow } from '@/components/recording-now';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { successFeedback } from '@/lib/haptics';
import { diffWords, type DiffPart } from '@/lib/word-diff';
import { usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { useSpokenAttempt } from '@/voice/use-spoken-attempt';

/** Why an attempt failed, as the sheet says it; any other reason reads as "unavailable". */
const FAILURE_KEY = {
  mic_denied: 'conversation.problems.mic_denied',
  retry_limit: 'report.retry.failed.limit',
  consent_required: 'report.retry.failed.consent',
  network: 'errors.network',
} as const;

const failureKey = (code: string) =>
  code in FAILURE_KEY
    ? FAILURE_KEY[code as keyof typeof FAILURE_KEY]
    : 'report.retry.failed.unavailable';

/** A sentence with some of its words marked: `tone` says whether they are right or still off. */
function Marked({ parts, tone }: { parts: readonly DiffPart[]; tone: 'primary' | 'warn' }) {
  const { color } = useTheme();
  return (
    <Text variant="emphasis">
      {parts.flatMap((part, i) => [
        i > 0 ? ' ' : '',
        part.changed ? (
          <Text
            key={i}
            variant="emphasis"
            tone={tone === 'primary' ? 'primary' : 'inherit'}
            className={tone === 'primary' ? 'rounded-sm bg-primary-soft' : 'underline'}
            style={tone === 'warn' ? { textDecorationColor: color.warnMark } : undefined}
          >
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      ])}
    </Text>
  );
}

/**
 * "Say it better" (spec §6.5): the learner says a corrected sentence again, Konvami checks it, and
 * they hear their before and after. The sentence is what they said with the correction put in
 * (`practiceSentence`), its changed words standing out. A recording stops when they tap Stop, or
 * by itself after a while; the server writes it down keeping mistakes and says whether the
 * correction is in it. Right: a small celebration. Not yet: what was heard, its off words marked,
 * and another try.
 */
export function SayItBetterSheet({
  conversationId,
  index,
  said,
  sentence,
  before,
  onClose,
  onRight,
}: {
  conversationId: string;
  /** The correction's position in the report; null while the sheet is closed. */
  index: number | null;
  /** What the learner said, and the same put right. */
  said: string;
  sentence: string;
  /** The recording of what they said, when it was kept. */
  before: { url: string; milliseconds: number } | null;
  onClose: () => void;
  onRight: (index: number) => void;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { retryCorrection, clips } = usePracticeServices();
  const { step, record, stop, reset } = useSpokenAttempt(
    (recording) => {
      // Recording is offered only while the sheet is open on a correction.
      if (index === null) return Promise.reject(new Error('closed'));
      return retryCorrection(conversationId, index, recording);
    },
    (result) => {
      if (result.right && index !== null) {
        successFeedback();
        onRight(index);
      }
    },
  );
  const open = index !== null;

  // Leaving stops what is playing.
  useEffect(() => () => clips.stop(), [clips]);

  /** Closes the sheet; the next correction opened starts afresh. */
  function close() {
    clips.stop();
    reset();
    onClose();
  }

  const target = diffWords(said, sentence).after;
  const playBefore = before
    ? () => clips.play(before.url, () => {}, before.milliseconds)
    : undefined;
  return (
    <Sheet visible={open} title={t('report.retry.title')} onClose={close}>
      <View className="gap-4 pt-1">
        <View className="gap-1.5">
          <Text variant="small" tone="muted">
            {t('report.retry.instruction')}
          </Text>
          <Marked parts={target} tone="primary" />
        </View>
        {step.kind === 'ready' ? (
          <View className="gap-2">
            <Button
              label={t('report.retry.record')}
              leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
              onPress={() => void record()}
            />
            {playBefore ? (
              <TextButton tone="primary" label={t('report.retry.before')} onPress={playBefore} />
            ) : null}
          </View>
        ) : null}
        {step.kind === 'recording' ? (
          <RecordingNow
            label={t('report.retry.recording')}
            hint={t('report.retry.recordingHint')}
            stopLabel={t('report.retry.stop')}
            onStop={() => void stop()}
          />
        ) : null}
        {step.kind === 'checking' ? (
          <Text tone="muted" accessibilityLiveRegion="polite" className="text-center">
            {t('report.retry.checking')}
          </Text>
        ) : null}
        {step.kind === 'heard' ? (
          <Reveal>
            <View className="gap-3" accessibilityLiveRegion="polite">
              {step.result.right ? (
                <Pop>
                  <View className="flex-row items-center gap-2">
                    <Icon name="check" color={color.success} size={size.iconMd} />
                    <Text variant="heading" accessibilityRole="header">
                      {t('report.retry.right')}
                    </Text>
                  </View>
                </Pop>
              ) : (
                <Text variant="labelMedium">{t('report.retry.almost')}</Text>
              )}
              {step.result.right ? (
                <Text tone="muted">{step.result.heard}</Text>
              ) : (
                <Marked parts={diffWords(sentence, step.result.heard).after} tone="warn" />
              )}
              <View className="flex-row flex-wrap gap-x-2">
                {playBefore ? (
                  <TextButton
                    tone="primary"
                    label={t('report.retry.before')}
                    onPress={playBefore}
                  />
                ) : null}
                <TextButton
                  tone="primary"
                  label={t('report.retry.after')}
                  onPress={() =>
                    clips.play(step.recording.uri, () => {}, step.recording.durationMs)
                  }
                />
              </View>
              {step.result.right ? (
                <Button label={t('report.retry.done')} onPress={close} />
              ) : (
                <Button label={t('report.retry.again')} onPress={reset} />
              )}
            </View>
          </Reveal>
        ) : null}
        {step.kind === 'failed' ? (
          <View className="gap-3">
            <NoticeBox icon="alert" tone="danger">
              {t(failureKey(step.code))}
            </NoticeBox>
            <Button label={t('report.retry.again')} onPress={reset} />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
