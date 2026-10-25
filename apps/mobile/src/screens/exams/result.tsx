import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { PartScore, Simulation, SpeakingExam } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Meter } from '@/components/meter';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Pill } from '@/components/pill';
import { PlayButton } from '@/components/play-button';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useSound } from '@/hooks/use-sound';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { examPrepRoute, ROUTES } from '@/lib/routes';
import { useExamCentre, usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { ExamCard } from './exam-card';
import { CRITERIA, MAX_MARK, useExamLabels } from '@/hooks/use-exam-labels';

/** The model answer of a part, in writing and in the examiner's voice. */
function ModelAnswer({ callId, score }: { callId: string; score: PartScore }) {
  const { t } = useTranslation();
  const { modelAnswerSound } = usePracticeServices();
  const sound = useSound(`${callId}/${score.part}`, () => modelAnswerSound(callId, score.part));
  return (
    <View className="gap-1.5">
      <Text variant="caption" tone="subtle">
        {t('exams.result.modelAnswer')}
      </Text>
      <View className="flex-row items-start gap-3">
        <Text variant="callout" className="flex-1">
          {score.modelAnswer}
        </Text>
        <PlayButton
          label={sound.state === 'playing' ? t('exams.result.stop') : t('exams.result.listen')}
          state={sound.state}
          onPress={sound.toggle}
        />
      </View>
    </View>
  );
}

/** One part: its share of the points, each criterion's marks, the feedback, a strong answer. */
function PartCard({
  simulation,
  exam,
  index,
  score,
}: {
  simulation: Simulation;
  exam: SpeakingExam | undefined;
  index: number;
  score: PartScore;
}) {
  const { t } = useTranslation();
  const labels = useExamLabels();
  const kind = exam?.parts[index]?.kind;
  const heading = kind ? labels.part(index, kind) : score.part;
  const card = simulation.cards[index];
  return (
    <Card className="gap-4 p-4">
      <View className="gap-2">
        <Text variant="heading" accessibilityRole="header">
          {heading}
        </Text>
        <Meter
          share={score.share}
          value={labels.percent(score.share)}
          label={t('exams.result.partScore', {
            part: heading,
            percent: labels.percent(score.share),
          })}
        />
      </View>
      <View className="gap-1">
        {CRITERIA.map((criterion) => (
          <View key={criterion} className="flex-row justify-between gap-3">
            <Text variant="callout">{labels.criterion(criterion)}</Text>
            <Text variant="label">
              {t('exams.result.mark', { mark: score.marks[criterion], max: MAX_MARK })}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="callout" tone="muted">
        {score.feedback}
      </Text>
      {card ? <ExamCard heading={t('exams.result.yourCard')} card={card} /> : null}
      <ModelAnswer callId={simulation.callId} score={score} />
    </Card>
  );
}

function Scored({ simulation, exam }: { simulation: Simulation; exam: SpeakingExam | undefined }) {
  const { t } = useTranslation();
  const labels = useExamLabels();
  const result = simulation.result;
  if (!result) return null;
  const pass = labels.percent(result.passShare);
  return (
    <View className="gap-4">
      <Reveal delay={staggerDelay(1)}>
        <Card className="gap-3 p-4">
          <Text variant="stat">{labels.percent(result.total)}</Text>
          <View className="items-start">
            <Pill
              tone={result.passed ? 'primary' : 'warn'}
              label={
                result.passed
                  ? t('exams.result.passed', { percent: pass })
                  : t('exams.result.notPassed', { percent: pass })
              }
            />
          </View>
          <Text variant="caption" tone="subtle">
            {t('exams.result.summary')}
          </Text>
          <Text variant="callout">{result.summary}</Text>
        </Card>
      </Reveal>
      {result.parts.map((score, i) => (
        <Reveal key={score.part} delay={staggerDelay(Math.min(i, 3) + 2)}>
          <PartCard simulation={simulation} exam={exam} index={i} score={score} />
        </Reveal>
      ))}
    </View>
  );
}

/**
 * 5.18 A simulation's score (spec §6.13): written on the server about half a minute after the
 * call, followed here until it is. Every part has its marks by criterion, the reasons and a
 * strong answer to hear; the total is set against the pass mark. Always an estimate.
 */
export function SimulationScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { followSimulation, exams } = usePracticeServices();
  const centre = useExamCentre();
  const follower = useMemo(() => followSimulation(id ?? ''), [followSimulation, id]);
  const view = useSyncExternalStore(follower.subscribe, follower.getState, follower.getState);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    void follower.follow();
    void exams.load();
    return () => follower.stop();
  }, [signedIn, follower, exams]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const simulation = view.phase === 'ready' ? view.value : null;
  const examId = simulation?.exam;
  const exam =
    centre.phase === 'ready'
      ? centre.data.formats.find(({ id: format }) => format === examId)
      : undefined;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.exams)}
          />
        </View>
      }
      actions={
        examId ? (
          <View className="gap-1">
            <Button
              label={t('exams.result.again')}
              onPress={() => router.replace(examPrepRoute(examId))}
            />
            <TextButton
              tone="primary"
              label={t('exams.result.back')}
              onPress={() => router.replace(ROUTES.exams)}
            />
          </View>
        ) : undefined
      }
    >
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {exam?.name ?? t('exams.result.title')}
          </Text>
          <Text variant="small" tone="muted">
            {t('exams.result.estimate')}
          </Text>
        </View>
      </Reveal>
      {view.phase === 'ready' ? (
        <Scored simulation={view.value} exam={exam} />
      ) : view.phase === 'failed' ? (
        <View className="items-start gap-2">
          <NoticeBox icon="info" tone="surface">
            {t(view.code === 'too_short' ? 'exams.result.tooShort' : 'exams.result.failed')}
          </NoticeBox>
          {view.code !== 'too_short' ? (
            <TextButton
              tone="primary"
              label={t('exams.result.retry')}
              onPress={() => void follower.request()}
            />
          ) : null}
        </View>
      ) : (
        <View className="flex-row items-center gap-2.5">
          <ActivityIndicator color={color.primary} />
          <Text variant="callout" tone="muted" className="flex-1">
            {t('exams.result.scoring')}
          </Text>
        </View>
      )}
    </StepLayout>
  );
}
