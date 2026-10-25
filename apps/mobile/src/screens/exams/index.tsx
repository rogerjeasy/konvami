import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ExamCentre, SpeakingExam } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChip } from '@/components/choice-chip';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Meter } from '@/components/meter';
import { Reveal } from '@/components/motion';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { daysUntil, formatDate, formatShortDate } from '@/lib/format';
import { stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { examPrepRoute, ROUTES, simulationRoute } from '@/lib/routes';
import { useExamCentre, usePracticeServices } from '@/practice/services';
import { useExamLabels } from '@/hooks/use-exam-labels';

// Points are shares of 100 ("+10 points since last time").
const POINTS = 100;

/** The exam in the learner's profile, or a note that there is none. */
function YourExam({ centre, now }: { centre: ExamCentre; now: Date }) {
  const { t, i18n } = useTranslation();
  const exam = centre.exam;
  const name = centre.formats.find(({ id }) => id === centre.suggested)?.name;
  if (!exam) {
    return (
      <Text variant="callout" tone="muted">
        {t('exams.noExam')}
      </Text>
    );
  }
  const left = exam.date ? daysUntil(exam.date, now) : null;
  return (
    <Card className="gap-1 p-4">
      <Text variant="overline" tone="subtle" accessibilityRole="header">
        {t('exams.yourExam')}
      </Text>
      <Text variant="label">{name ?? exam.type}</Text>
      <Text variant="small" tone="muted">
        {exam.date && left !== null
          ? `${formatDate(i18n.language, exam.date)} · ${t('exams.inDays', { count: left })}`
          : t('exams.noDate')}
      </Text>
      {!name ? (
        <Text variant="small" tone="muted">
          {t('exams.noSimulation')}
        </Text>
      ) : null}
    </Card>
  );
}

/** One speaking test: its parts, their times and the preparation time. */
function Format({ exam }: { exam: SpeakingExam }) {
  const { t } = useTranslation();
  const labels = useExamLabels();
  const speaking = exam.parts.reduce((sum, part) => sum + part.seconds, 0);
  return (
    <Card className="gap-3 p-4">
      <Text variant="small" tone="muted">
        {[
          t('exams.summary', { count: exam.parts.length, minutes: labels.minutes(speaking) }),
          exam.prepSeconds
            ? t('exams.prep', { minutes: labels.minutes(exam.prepSeconds) })
            : t('exams.noPrep'),
        ].join(' · ')}
      </Text>
      {exam.parts.map((part, i) => (
        <View key={part.id} className="flex-row items-start justify-between gap-3">
          <Text variant="label" className="flex-1">
            {labels.part(i, part.kind)}
          </Text>
          <Text variant="small" tone="muted">
            {labels.minutes(part.seconds)}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/** How ready the learner is for one test: the latest score, its change, the weakest part. */
function Readiness({ centre, exam }: { centre: ExamCentre; exam: SpeakingExam }) {
  const { t, i18n } = useTranslation();
  const labels = useExamLabels();
  const ready = centre.readiness[exam.id];
  if (!ready) return null;
  const weakest = exam.parts.findIndex(({ id }) => id === ready.weakest);
  const weakPart = exam.parts[weakest];
  const change = ready.change === null ? null : Math.round(ready.change * POINTS);
  return (
    <Card className="gap-3 p-4">
      <Text variant="overline" tone="subtle" accessibilityRole="header">
        {t('exams.readiness.title')}
      </Text>
      <Meter
        share={ready.latest}
        value={labels.percent(ready.latest)}
        label={t('exams.readiness.latest', { percent: labels.percent(ready.latest) })}
      />
      <Text variant="small" tone="muted">
        {t('exams.readiness.passMark', { percent: labels.percent(exam.passShare) })}
      </Text>
      {change !== null && change !== 0 ? (
        <Text variant="small" tone="muted">
          {t(change > 0 ? 'exams.readiness.up' : 'exams.readiness.down', {
            count: Math.abs(change),
          })}
        </Text>
      ) : null}
      {weakPart ? (
        <Text variant="small" tone="muted">
          {labels.weakest(weakest, weakPart.kind)}
        </Text>
      ) : null}
      <Text variant="callout">
        {ready.passing
          ? t('exams.readiness.passing')
          : ready.readyOn
            ? t('exams.readiness.readyOn', { date: formatDate(i18n.language, ready.readyOn) })
            : t('exams.readiness.keepGoing')}
      </Text>
    </Card>
  );
}

/** The learner's simulations, newest first, each opening its score. */
function History({ centre, now }: { centre: ExamCentre; now: Date }) {
  const { t, i18n } = useTranslation();
  const labels = useExamLabels();
  if (!centre.simulations.length) return null;
  const names = new Map(centre.formats.map(({ id, name }) => [id, name]));
  return (
    <Section title={t('exams.history')}>
      <ListGroup>
        {centre.simulations.map((simulation) => (
          <ListRow
            key={simulation.callId}
            icon="award"
            title={`${names.get(simulation.exam) ?? simulation.exam} · ${formatShortDate(i18n.language, simulation.startedAt, now)}`}
            detail={
              simulation.total !== null
                ? labels.percent(simulation.total)
                : t(`exams.status.${simulation.status}`)
            }
            onPress={() => router.push(simulationRoute(simulation.callId))}
          />
        ))}
      </ListGroup>
    </Section>
  );
}

function Centre({
  centre,
  now,
  chosen,
  onChoose,
}: {
  centre: ExamCentre;
  now: Date;
  chosen: SpeakingExam | undefined;
  onChoose: (exam: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-5">
      <Reveal delay={staggerDelay(1)}>
        <YourExam centre={centre} now={now} />
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <View className="gap-2.5">
          <Text variant="fieldLabel" accessibilityRole="header">
            {t('exams.choose')}
          </Text>
          <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
            {centre.formats.map((format) => (
              <ChoiceChip
                key={format.id}
                label={format.name}
                selected={format.id === chosen?.id}
                onPress={() => {
                  stepFeedback();
                  onChoose(format.id);
                }}
              />
            ))}
          </View>
        </View>
      </Reveal>
      {chosen ? (
        <Reveal delay={staggerDelay(3)}>
          <View className="gap-4">
            <Format exam={chosen} />
            <Readiness centre={centre} exam={chosen} />
          </View>
        </Reveal>
      ) : null}
      <Reveal delay={staggerDelay(4)}>
        <History centre={centre} now={now} />
      </Reveal>
    </View>
  );
}

/**
 * 5.16 Exam centre (spec §6.13): the learner's exam, the speaking tests that can be simulated
 * with their parts, how ready the learner is (latest score, change, weakest part, when a steady
 * rise reaches the pass mark) and their simulations so far. Scores are estimates.
 */
export function ExamCentreScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { exams: store, clock } = usePracticeServices();
  const state = useExamCentre();
  // Until the learner picks one: their own exam's test, or the first.
  const [picked, setPicked] = useState<string | null>(null);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  // Back from a simulation: its score may have arrived.
  useFocusEffect(
    useCallback(() => {
      void store.refresh();
    }, [store]),
  );

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const centre = state.phase === 'ready' ? state.data : null;
  const chosenId = picked ?? centre?.suggested ?? centre?.formats[0]?.id;
  const chosen = centre?.formats.find(({ id }) => id === chosenId);
  return (
    <StepLayout
      actions={
        chosen ? (
          <Button
            label={t('exams.prepare')}
            onPress={() => router.push(examPrepRoute(chosen.id))}
          />
        ) : undefined
      }
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.learn)}
          />
        </View>
      }
    >
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {t('exams.title')}
          </Text>
          <Text tone="muted">{t('exams.body')}</Text>
        </View>
      </Reveal>
      {centre ? (
        <Centre centre={centre} now={new Date(clock.now())} chosen={chosen} onChoose={setPicked} />
      ) : (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('exams.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(state.error === 'network' ? 'errors.network' : 'exams.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      )}
    </StepLayout>
  );
}
