import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PronunciationAttempt } from '@konvami/api-client';
import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { ASSESSMENT_MAX_SECONDS } from '@/lib/pcm-wav';
import { usePracticeServices, usePronunciation } from '@/practice/services';
import { assessmentAudio, canAssessAudio } from '@/voice/assessment-audio';
import { AssessmentResult } from '@/screens/pronunciation/assessment-result';

/** Consent is per saved learner recording; opening the sheet never sends audio to a provider. */
interface Props {
  callId: string;
  turn: number;
  audio: { url: string; milliseconds: number };
}

export function ConversationPronunciation(props: Props) {
  return <TurnAssessment key={`${props.callId}:${props.turn}:${props.audio.url}`} {...props} />;
}

function TurnAssessment({ callId, turn, audio }: Props) {
  const { t } = useTranslation();
  const { pronunciation, assessConversationPronunciation } = usePracticeServices();
  const lab = usePronunciation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<PronunciationAttempt | null>(null);
  const generation = useRef({ value: 0 });
  useEffect(() => {
    void pronunciation.load();
    const lifetime = generation.current;
    return () => {
      lifetime.value++;
    };
  }, [pronunciation]);
  const provider = lab.data?.assessmentProvider;
  if (!provider || !canAssessAudio() || audio.milliseconds > ASSESSMENT_MAX_SECONDS * 1000)
    return null;
  function close() {
    generation.current.value++;
    setOpen(false);
    setBusy(false);
    setFailed(false);
    setResult(null);
  }
  async function assess() {
    const request = ++generation.current.value;
    setBusy(true);
    setFailed(false);
    try {
      const recording = await assessmentAudio(audio.url);
      if (request !== generation.current.value) return;
      const attempt = await assessConversationPronunciation(callId, turn, recording);
      if (request === generation.current.value) setResult(attempt);
    } catch {
      if (request === generation.current.value) setFailed(true);
    } finally {
      if (request === generation.current.value) setBusy(false);
    }
  }
  return (
    <>
      <TextButton label={t('pronunciation.comparison.assessTurn')} onPress={() => setOpen(true)} />
      <Sheet visible={open} title={t('pronunciation.assessment.title')} onClose={close}>
        <View className="gap-4 pt-2">
          {result?.assessment ? (
            <AssessmentResult assessment={result.assessment} />
          ) : (
            <>
              <Text>{t('pronunciation.comparison.consentTurn', { provider })}</Text>
              <Button
                label={t('pronunciation.comparison.agree')}
                loading={busy}
                onPress={() => void assess()}
              />
              {failed ? <Text tone="muted">{t('pronunciation.failed.unavailable')}</Text> : null}
            </>
          )}
        </View>
      </Sheet>
    </>
  );
}
