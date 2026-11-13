import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Button } from '@/components/button';
import { ChoiceChip } from '@/components/choice-chip';
import { Icon } from '@/components/icon';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { RecordingNow } from '@/components/recording-now';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { Switch } from '@/components/switch';
import { successFeedback } from '@/lib/haptics';
import { usePracticeServices, usePronunciation } from '@/practice/services';
import { useTheme } from '@/theme';
import { assessmentAudio, canAssessAudio } from '@/voice/assessment-audio';
import { AssessmentResult } from './assessment-result';
import { useSpokenAttempt } from '@/voice/use-spoken-attempt';
import { HeardWords } from './heard-words';
import { labFailureKey, type LabDrill } from './lab';
import { ListenButton } from './listen-button';
import { WaveformComparison } from './waveform-comparison';

// How fast a sentence plays when the learner asks for it slowly.
const SLOW_RATE = 0.75;

/**
 * One thing to say in the pronunciation lab (spec §6.14): the learner hears it first, says it, and
 * sees which words were heard as asked. The check writes the recording down and compares words;
 * it is an approximation and the sheet says so. A word that was not heard is never shown as a
 * failure: it goes to the learner's problem words, and the next try is one press away.
 */
export function DrillSheet({ drill, onClose }: { drill: LabDrill | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { drillPronunciation, clips, pronunciation } = usePracticeServices();
  const [slow, setSlow] = useState(false);
  const [assessmentConsent, setAssessmentConsent] = useState(false);
  const lab = usePronunciation();
  const provider = lab.data?.assessmentProvider;
  useEffect(() => {
    if (drill) void pronunciation.load();
  }, [drill, pronunciation]);
  const { step, record, stop, reset } = useSpokenAttempt(
    async (recording) => {
      // Recording is offered only while the sheet is open on a drill.
      if (!drill) return Promise.reject(new Error('closed'));
      return drillPronunciation(
        {
          drill: drill.kind,
          soundId: drill.soundId,
          target: drill.target,
          ...(assessmentConsent ? { assessmentConsent: true } : {}),
        },
        assessmentConsent ? await assessmentAudio(recording) : recording,
      );
    },
    (result) => {
      if (result.right) successFeedback();
    },
  );

  /** Closes the sheet; the next drill opened starts afresh. */
  function close() {
    clips.stop();
    reset();
    setAssessmentConsent(false);
    onClose();
  }

  const shadow = drill?.kind === 'shadow';
  return (
    <Sheet
      visible={drill !== null}
      title={t(shadow ? 'pronunciation.sheet.shadowTitle' : 'pronunciation.sheet.wordTitle')}
      onClose={close}
    >
      <View className="gap-4 pt-1">
        <View className="gap-1.5">
          <Text variant="small" tone="muted">
            {t(shadow ? 'pronunciation.sheet.shadowHint' : 'pronunciation.sheet.wordHint')}
          </Text>
          <Text variant="heading">{drill?.target ?? ''}</Text>
        </View>
        <View className="gap-3">
          {drill?.listen.map((text) => (
            <ListenButton
              key={text}
              text={text}
              label={shadow ? undefined : text}
              rate={shadow && slow ? SLOW_RATE : 1}
            />
          ))}
          {shadow ? (
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
              <ChoiceChip
                label={t('pronunciation.sheet.normal')}
                selected={!slow}
                onPress={() => setSlow(false)}
              />
              <ChoiceChip
                label={t('pronunciation.sheet.slow')}
                selected={slow}
                onPress={() => setSlow(true)}
              />
            </View>
          ) : null}
        </View>
        {provider && canAssessAudio() && step.kind === 'ready' ? (
          <View className="flex-row items-center gap-3">
            <Text variant="small" className="flex-1">
              {t('pronunciation.assessment.consent', { provider })}
            </Text>
            <Switch
              label={t('pronunciation.assessment.enable')}
              value={assessmentConsent}
              onValueChange={setAssessmentConsent}
            />
          </View>
        ) : null}
        {step.kind === 'ready' ? (
          <Button
            label={t('pronunciation.sheet.record')}
            leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
            onPress={() => void record()}
          />
        ) : null}
        {step.kind === 'recording' ? (
          <RecordingNow
            label={t('pronunciation.sheet.recording')}
            hint={t('pronunciation.sheet.recordingHint')}
            stopLabel={t('pronunciation.sheet.stop')}
            onStop={() => void stop()}
          />
        ) : null}
        {step.kind === 'checking' ? (
          <Text tone="muted" accessibilityLiveRegion="polite" className="text-center">
            {t('pronunciation.sheet.checking')}
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
                      {t('pronunciation.sheet.right')}
                    </Text>
                  </View>
                </Pop>
              ) : (
                <Text variant="labelMedium">{t('pronunciation.sheet.notYet')}</Text>
              )}
              <HeardWords words={step.result.words} />
              {step.result.assessment ? (
                <AssessmentResult assessment={step.result.assessment} />
              ) : null}
              {step.result.heard ? (
                <Text variant="small" tone="muted">
                  {t('pronunciation.sheet.heard', { text: step.result.heard })}
                </Text>
              ) : null}
              {drill?.listen.length === 1 && drill.listen[0] === drill.target ? (
                <WaveformComparison recording={step.recording} reference={drill.target} />
              ) : null}
              <Text variant="caption" tone="subtle">
                {t('pronunciation.approx')}
              </Text>
              {step.result.right ? (
                <Button label={t('pronunciation.sheet.done')} onPress={close} />
              ) : (
                <Button label={t('pronunciation.sheet.again')} onPress={reset} />
              )}
            </View>
          </Reveal>
        ) : null}
        {step.kind === 'failed' ? (
          <View className="gap-3">
            <NoticeBox icon="alert" tone="danger">
              {t(labFailureKey(step.code))}
            </NoticeBox>
            <Button label={t('pronunciation.sheet.again')} onPress={reset} />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
