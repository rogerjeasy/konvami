import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { NextSimulation } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { useCountdown } from '@/hooks/use-countdown';
import { formatDuration } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { examTalkRoute, ROUTES } from '@/lib/routes';
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
  const { t } = useTranslation();
  const labels = useExamLabels();
  const { draft, update } = useExamNotes();
  const { exam, cards } = next;
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
              router.replace(examTalkRoute(exam.id));
            }}
          />
        </View>
      }
    >
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {exam.name}
          </Text>
          <Text tone="muted">{t('exams.prepBody')}</Text>
        </View>
      </Reveal>
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
          </Reveal>
        ) : null;
      })}
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
  if (next.phase === 'ready') return <Prep next={next.data} header={header} />;
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
