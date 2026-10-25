import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Conversation, SessionReport, TranscriptTurn } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { wholeMinutes } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { practiceSentence } from '@/lib/practice-sentence';
import { relativeDayLabel } from '@/lib/relative-day';
import { callRoute, conversationRoute, explainRoute, ROUTES } from '@/lib/routes';
import { useConversation, usePracticeServices, useReport } from '@/practice/services';
import { LevelStepNote } from './level-step';
import { Keep, Natural, NextSteps, Polish, Wins, Words } from './sections';
import { SayItBetterSheet } from './say-it-better';
import { ReportStatus } from './status';
import { TalkShare } from './talk-share';
import { useCardSaver } from './use-card-saver';

// Stands between the parts of the line under the title ("With Lena · Today · 8 min").
const SEPARATOR = ' · ';

/** The title and, once the conversation is known, who it was with, when and for how long. */
function Heading({ conversation }: { conversation: Conversation | null }) {
  const { t, i18n } = useTranslation();
  const { clock } = usePracticeServices();
  const meta = conversation
    ? [
        conversation.partner ? t('report.with', { name: conversation.partner.name }) : null,
        relativeDayLabel(t, i18n.language, conversation.startedAt, new Date(clock.now())),
        t('time.minutes', { count: wholeMinutes(conversation.seconds) }),
      ].filter((part) => part !== null)
    : [];
  return (
    <Reveal>
      <View className="gap-1.5">
        <Text variant="title" accessibilityRole="header">
          {t('report.title')}
        </Text>
        {meta.length ? (
          <Text variant="small" tone="subtle">
            {meta.join(SEPARATOR)}
          </Text>
        ) : null}
      </View>
    </Reveal>
  );
}

/**
 * The corrections of a report the learner said right since ("Say it better"): read once, then
 * kept up to date as they practise.
 */
function usePractised(id: string): [ReadonlySet<number>, (index: number) => void] {
  const { readRetries } = usePracticeServices();
  const [practised, setPractised] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    let current = true;
    readRetries(id).then(
      ({ retries }) =>
        current &&
        setPractised(new Set(retries.filter(({ right }) => right).map(({ index }) => index))),
      // Without them the report only lacks the marks.
      () => {},
    );
    return () => {
      current = false;
    };
  }, [readRetries, id]);
  return [practised, (index) => setPractised((done) => new Set([...done, index]))];
}

/** The report itself, read from top to bottom: what happened, what to polish, what to keep. */
function Report({
  id,
  report,
  partner,
  turns,
}: {
  id: string;
  report: SessionReport;
  partner: string;
  /** What was said in the conversation, once it is read; for saying a correction better. */
  turns: readonly TranscriptTurn[];
}) {
  const saver = useCardSaver(id, report);
  const [practised, markRight] = usePractised(id);
  const [retrying, setRetrying] = useState<number | null>(null);
  const mistake = retrying === null ? null : report.mistakes[retrying];
  const turn = mistake ? turns[mistake.turn] : undefined;
  const said = turn ? (turn.verbatim ?? turn.text) : null;
  const sentence = mistake
    ? practiceSentence(
        said,
        mistake,
        report.mistakes.filter(
          (other, i) => i !== retrying && other.certain && other.turn === mistake.turn,
        ),
      )
    : '';
  const parts = [
    report.levelStep ? <LevelStepNote key="level" step={report.levelStep} /> : null,
    <Card key="summary" className="gap-4 p-4">
      <Text>{report.summary}</Text>
      <View className="h-px bg-border" />
      <TalkShare stats={report.stats} partner={partner} />
    </Card>,
    <Keep
      key="keep"
      mistakes={report.mistakes}
      words={report.words}
      saver={saver}
      onOpenLearn={() => router.navigate(ROUTES.learn)}
    />,
    <Polish
      key="polish"
      mistakes={report.mistakes}
      saver={saver}
      practised={practised}
      onExplain={(index) => router.push(explainRoute(id, index))}
      onRetry={setRetrying}
    />,
    <Natural key="natural" rewrites={report.rewrites} />,
    <Words key="words" words={report.words} saver={saver} />,
    <Wins key="wins" wins={report.wins} />,
    <NextSteps key="next" steps={report.nextSteps} />,
  ];
  return (
    <>
      {parts
        .filter((part) => part !== null)
        .map((part, i) => (
          <Reveal key={part.key} delay={staggerDelay(i + 1)}>
            {part}
          </Reveal>
        ))}
      <SayItBetterSheet
        conversationId={id}
        index={retrying}
        // What the sentence to say is compared with, to show what changes: the learner's turn,
        // or their own words when the sentence is the corrected words alone.
        said={sentence === mistake?.corrected ? mistake.original : (said ?? '')}
        sentence={sentence}
        before={turn?.audio ?? null}
        onClose={() => setRetrying(null)}
        onRight={markRight}
      />
    </>
  );
}

/**
 * 5.10 Session report: what a practice conversation showed (spec §6.5). The new level, when
 * the conversation settled one (spec §6.9), a summary and the learner's share of the talking,
 * then the mistakes worth polishing, more natural wordings, the
 * words to keep, what went well and what to practise next. Words and confirmed corrections can
 * be saved as flashcards from here, one by one or all at once (spec §6.7). The server writes the report in the minute
 * after a conversation, so the screen also waits for it, and offers to have one written for a
 * conversation that has none. Everything is read from the conversation's text: nothing here
 * needs the recording, and nothing is made up when a part is empty.
 */
export function ReportScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const reading = useConversation(id);
  const { view, request, reload } = useReport(id);

  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;

  const conversation = reading.phase === 'ready' ? reading.transcript.conversation : null;
  const partner = conversation?.partner ?? null;
  const gone = reading.phase === 'failed' && reading.code === 'not_found';
  const ready = view.phase === 'ready' && !gone;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.library)}
          />
        </View>
      }
      actions={
        ready ? (
          <>
            {partner ? (
              <Button
                label={t('report.talkAgain', { name: partner.name })}
                onPress={() => router.push(callRoute(partner.id))}
              />
            ) : null}
            <TextButton
              tone="primary"
              label={t('report.transcript')}
              // Back to the transcript when the learner came from it, instead of a second one.
              onPress={() => router.dismissTo(conversationRoute(id))}
            />
          </>
        ) : undefined
      }
    >
      {gone ? (
        <NoticeBox icon="info">{t('report.notFound')}</NoticeBox>
      ) : view.phase === 'ready' ? (
        <>
          <Heading conversation={conversation} />
          <Report
            id={id}
            turns={reading.phase === 'ready' ? reading.transcript.turns : []}
            report={view.report}
            partner={partner?.name ?? t('conversations.formerPartner')}
          />
        </>
      ) : (
        <ReportStatus view={view} onRequest={request} onReload={reload} />
      )}
    </StepLayout>
  );
}
