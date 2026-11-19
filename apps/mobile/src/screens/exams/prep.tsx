import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { NextSimulation } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Switch } from '@/components/switch';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { PageHero } from '@/components/page-hero';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextField } from '@/components/text-field';
import { useCountdown } from '@/hooks/use-countdown';
import { formatDuration } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { examPhrasesRoute, examTalkRoute, ROUTES } from '@/lib/routes';
import { ExamCard } from './exam-card';
import { useExamLabels } from '@/hooks/use-exam-labels';
import { useExamNotes } from './notes';
import { useNextSimulation } from './use-next-simulation';

// What a learner may note: a page of keywords, as on the exam's paper.
const NOTES_MAX = 1000;

/** How long is left to prepare, counting from when the screen opened. */
function PrepTime({ seconds }: { seconds: number }) {
  const { t } = useTranslation();
  const { secondsLeft } = useCountdown(seconds);
  return (
    <NoticeBox icon="clock" tone="primary">
      {secondsLeft > 0
        ? t('exams.prepLeft', { time: formatDuration(secondsLeft) })
        : t('exams.prepOver')}
    </NoticeBox>
  );
}

function Prep({ next, header }: { next: NextSimulation; header: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const labels = useExamLabels();
  const { draft, update } = useExamNotes();
  const { exam, cards } = next;
  const [assessment, setAssessment] = useState(false);
  const speaking = exam.parts.reduce((sum, part) => sum + part.seconds, 0);
  return (
    <StepLayout
      header={header}
      actions={
        <View className="gap-2">
          <Text variant="small" tone="muted" className="text-center">
            {t('exams.startHint', { minutes: labels.minutes(speaking) })}
          </Text>
          <Button
            label={t('exams.start')}
            onPress={() => {
              commitFeedback();
              update({ assessmentExam: assessment && next.assessmentProvider ? exam.id : null });
              router.replace(examTalkRoute(exam.id));
            }}
          />
        </View>
      }
    >
      <Reveal>
        <PageHero color="forest" icon="award" title={exam.name} body={t('exams.prepBody')}>
          {exam.stage && exam.stages ? (
            <Text variant="labelSmall" tone="lime">
              {t('examStages.stage', { stage: exam.stage, total: exam.stages })}
            </Text>
          ) : null}
        </PageHero>
      </Reveal>
      <View className="items-start">
        <TextButton
          label={t('examPhrases.open')}
          tone="primary"
          onPress={() => router.push(examPhrasesRoute(exam.id))}
        />
      </View>
      {exam.prepSeconds > 0 ? (
        <Reveal delay={staggerDelay(1)}>
          <PrepTime seconds={exam.prepSeconds} />
        </Reveal>
      ) : null}
      {exam.parts.map((part, i) => {
        const card = cards[i];
        return card ? (
          <Reveal key={part.id} delay={staggerDelay(Math.min(i, 3) + 2)}>
            <ExamCard
              heading={`${labels.part(i, part.kind)} · ${labels.minutes(part.seconds)}`}
              card={card}
            />
            {part.phrases?.length ? (
              <View className="gap-2 p-4">
                <Text variant="label" accessibilityRole="header">
                  {t('exams.phraseBank')}
                </Text>
                {part.phrases.map((phrase) => {
                  const meaning = phrase.meanings[i18n.language] ?? phrase.meanings.en;
                  return (
                    <View key={phrase.text} className="gap-1">
                      <Text variant="langBody">{phrase.text}</Text>
                      {/* A German explanation would only repeat the phrase. */}
                      {meaning && meaning !== phrase.text ? (
                        <Text variant="small" tone="muted">
                          {meaning}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </Reveal>
        ) : null;
      })}
      {next.assessmentProvider ? (
        <Reveal delay={staggerDelay(4)}>
          <Card className="gap-3 p-4">
            <View className="flex-row items-center gap-3">
              <Text variant="label" className="flex-1">
                {t('examAcoustics.optIn')}
              </Text>
              <Switch
                label={t('examAcoustics.optIn')}
                value={assessment}
                onValueChange={setAssessment}
              />
            </View>
            <Text variant="small" tone="muted">
              {t('examAcoustics.consent', { provider: next.assessmentProvider })}
            </Text>
          </Card>
        </Reveal>
      ) : null}
      <Reveal delay={staggerDelay(5)}>
        <View className="gap-1">
          <TextField
            label={t('exams.notes')}
            value={draft.notes}
            onChangeText={(notes) => update({ notes })}
            maxLength={NOTES_MAX}
            multiline
          />
          <Text variant="small" tone="muted">
            {t('exams.notesHint')}
          </Text>
        </View>
      </Reveal>
    </StepLayout>
  );
}

/**
 * 5.17 Preparing a simulation (spec §6.13): the card of every part, in the order the examiner
 * runs them, the exam's own preparation time counting down, and room for notes, which stay on
 * screen during the test. The learner may start before the time is up.
 */
export function ExamPrepScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { exam } = useLocalSearchParams<{ exam: string }>();
  const [attempt, setAttempt] = useState(0);
  const next = useNextSimulation(exam ?? '', attempt);
  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  const header = (
    <View className="min-h-tap flex-row items-center">
      <HeaderButton
        icon="chevronLeft"
        label={t('common.back')}
        onPress={() => backOr(ROUTES.exams)}
      />
    </View>
  );
  if (next.phase === 'ready')
    return <Prep key={next.data.exam.id} next={next.data} header={header} />;
  return (
    <StepLayout header={header}>
      <LoadState
        failed={next.phase === 'failed'}
        loadingLabel={t('exams.loading')}
        slowLabel={t('common.wakingUp')}
        failedLabel={t(
          next.phase === 'failed' && next.code === 'network'
            ? 'errors.network'
            : 'exams.loadFailed',
        )}
        retryLabel={t('common.retry')}
        onRetry={() => setAttempt((count) => count + 1)}
      />
    </StepLayout>
  );
}
