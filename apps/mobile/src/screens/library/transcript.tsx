import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Transcript, RecordingTiming } from '@konvami/api-client';
import { useSession } from '@/auth';
import { ChatBubble, chatText } from '@/components/chat';
import { FlagButton } from '@/components/flag-button';
import { FlagSheet } from '@/components/flag-sheet';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PlayButton } from '@/components/play-button';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Pill } from '@/components/pill';
import { TextField } from '@/components/text-field';
import { ChoiceGroup } from '@/components/choice-group';
import type { Annotations } from '@/offline/library';
import { NoteEditor, RecordingTools } from './tools';
import { ConversationPronunciation } from './conversation-pronunciation';
import { FilterPill } from './filter-pill';
import { TurnMenu } from './turn-menu';
import { Text } from '@/components/text';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { timedText } from '@/lib/timed-text';
import { formatClock, wholeMinutes } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { relativeDayLabel } from '@/lib/relative-day';
import { reportRoute, ROUTES } from '@/lib/routes';
import { useConversation, usePracticeServices } from '@/practice/services';
import { usePlayback } from '@/practice/use-playback';
import { useFlags } from '@/practice/use-flags';

// Stands between the parts of the line under the title ("Today · 14:05 · 8 min").
const SEPARATOR = ' · ';

function Lines({ transcript, now }: { transcript: Transcript; now: Date }) {
  const { t, i18n } = useTranslation();
  const { conversation } = transcript;
  const { compact } = useScreenLayout();
  const { libraryTools, readRecordingTiming } = usePracticeServices();
  const [timings, setTimings] = useState<Record<number, RecordingTiming>>({});
  const [timingBusy, setTimingBusy] = useState<number | null>(null);
  const [timingFailed, setTimingFailed] = useState(false);
  const [turns, setTurns] = useState(transcript.turns);
  const [annotations, setAnnotations] = useState<Annotations>({});
  const [revision, setRevision] = useState(0);
  const [noteTurn, setNoteTurn] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [speaker, setSpeaker] = useState<'all' | 'learner' | 'persona'>('all');
  useEffect(() => {
    let current = true;
    if (!libraryTools) return;
    void libraryTools
      .local(transcript)
      .then((local) => {
        if (current) setTurns(local.turns);
      })
      .catch(() => {
        if (current) setTurns(transcript.turns);
      });
    void libraryTools
      .annotations(conversation.id)
      .then((found) => {
        if (current) setAnnotations(found);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [libraryTools, transcript, conversation.id, revision]);
  const partner = conversation.partner?.name ?? t('conversations.formerPartner');
  const { playing, positionMs, toggle, rate, setRate, loop, setLoop } = usePlayback(turns);
  const flags = useFlags(conversation.id);
  // The partner's line being reported (its place in the transcript); null while none is.
  const [reporting, setReporting] = useState<number | null>(null);
  // A line of the second partner of a two-partner conversation (5.24) is theirs, not the lead's.
  const nameOf = (turn: { speaker: 'persona' | 'learner'; guest?: boolean }) =>
    turn.speaker === 'learner'
      ? t('library.transcript.you')
      : turn.guest
        ? (conversation.guest?.name ?? t('conversations.formerPartner'))
        : partner;
  const playLabel = (turn: { speaker: 'persona' | 'learner'; guest?: boolean }) =>
    turn.speaker === 'learner'
      ? t('library.transcript.playYou')
      : (turn.guest ? conversation.guest : conversation.partner)
        ? t('library.transcript.playPartner', { name: nameOf(turn) })
        : t('library.transcript.playFormer');
  // Plays the line with its words lit up, asking for their timing the first time.
  const highlight = (i: number) => {
    if (timings[i]) {
      toggle(i);
      return;
    }
    setTimingBusy(i);
    setTimingFailed(false);
    void readRecordingTiming(conversation.id, i)
      .then((value) => {
        setTimings((before) => ({ ...before, [i]: value }));
        if (value.words.length) toggle(i);
      })
      .catch(() => setTimingFailed(true))
      .finally(() => setTimingBusy(null));
  };
  const meta = [
    relativeDayLabel(t, i18n.language, conversation.startedAt, now),
    formatClock(i18n.language, conversation.startedAt),
    conversation.endedAt ? t('time.minutes', { count: wholeMinutes(conversation.seconds) }) : null,
  ].filter((part) => part !== null);
  return (
    <>
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {conversation.partner
              ? t('library.transcript.title', { name: partner })
              : t('library.transcript.titleNoPartner')}
          </Text>
          <Text variant="small" tone="subtle">
            {meta.join(SEPARATOR)}
          </Text>
        </View>
      </Reveal>
      <RecordingTools
        transcript={transcript}
        tools={libraryTools}
        rate={rate}
        setRate={setRate}
        loop={loop}
        setLoop={setLoop}
        changed={() => setRevision((value) => value + 1)}
      />
      {timingFailed ? <NoticeBox icon="info">{t('offlineLibrary.failed')}</NoticeBox> : null}
      <TextField label={t('offlineLibrary.textSearch')} value={query} onChangeText={setQuery} />
      <ChoiceGroup label={t('offlineLibrary.speakers')} chips>
        {(['all', 'learner', 'persona'] as const).map((value) => (
          <FilterPill
            key={value}
            label={t(`offlineLibrary.${value}`)}
            selected={speaker === value}
            onPress={() => setSpeaker(value)}
          />
        ))}
      </ChoiceGroup>
      {/* A call counts as practice, and has a report, once the learner said something in it. */}
      {conversation.endedAt && conversation.learnerTurns > 0 ? (
        <Reveal delay={staggerDelay(1)}>
          <ListGroup>
            <ListRow
              icon="file"
              title={t('library.transcript.report')}
              detail={t('library.transcript.reportHint')}
              onPress={() => router.push(reportRoute(conversation.id))}
            />
          </ListGroup>
        </Reveal>
      ) : null}
      {turns.length === 0 ? (
        <Text tone="muted">{t('library.transcript.empty')}</Text>
      ) : (
        <View className="gap-2.5">
          {turns.map((turn, i) => {
            // What the learner said as the verbatim pass wrote it down, mistakes and all.
            const text = turn.verbatim ?? turn.text;
            if (
              (speaker !== 'all' && turn.speaker !== speaker) ||
              (query.trim() && !text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
            )
              return null;
            const annotation = annotations[String(i)] ?? { bookmarked: false, note: '' };
            return (
              <View
                key={i}
                // On a narrow phone the buttons go under the line, so it keeps its width.
                className={`w-full gap-2 ${
                  compact
                    ? turn.speaker === 'learner'
                      ? 'items-end'
                      : 'items-start'
                    : turn.speaker === 'learner'
                      ? 'flex-row-reverse items-center'
                      : 'flex-row items-center'
                }`}
              >
                {/* A screen reader hears who said each line; sighted readers see it by the side. */}
                {/* The line takes the row, its bubble on the speaker's side, so the buttons beside
                    every line stand in one column and a short line never gets squeezed. */}
                <View
                  className={`gap-1.5 ${compact ? 'self-stretch' : 'flex-1'} ${turn.speaker === 'learner' ? 'items-end' : 'items-start'}`}
                >
                  {/* With two partners, each of their lines says whose it is. */}
                  {conversation.guest && turn.speaker === 'persona' ? (
                    <Text variant="labelSmall" tone="muted" aria-hidden>
                      {nameOf(turn)}
                    </Text>
                  ) : null}
                  <ChatBubble
                    from={turn.speaker}
                    lang
                    accessibilityLabel={t('library.transcript.line', {
                      speaker: nameOf(turn),
                      text,
                    })}
                  >
                    {timings[i]?.words.length
                      ? timedText(text, timings[i]!.words, playing === i ? positionMs : -1).map(
                          (part, index) => (
                            <Text
                              key={index}
                              {...chatText(turn.speaker, true)}
                              className={part.active ? 'underline font-body-semibold' : undefined}
                            >
                              {part.text}
                            </Text>
                          ),
                        )
                      : text}
                  </ChatBubble>
                  {turn.speaker === 'learner' && turn.audio ? (
                    <ConversationPronunciation
                      callId={conversation.id}
                      turn={i}
                      audio={turn.audio}
                    />
                  ) : null}
                  {annotation.note ? (
                    <Text variant="small" tone="muted">
                      {annotation.note}
                    </Text>
                  ) : null}
                  {annotation.bookmarked ? (
                    <View className={`flex-row ${turn.speaker === 'learner' ? 'justify-end' : ''}`}>
                      <Pill tone="primary" label={t('offlineLibrary.bookmarked')} />
                    </View>
                  ) : null}
                </View>
                <View
                  className={`flex-row items-center gap-2 ${
                    turn.speaker === 'learner' ? 'flex-row-reverse' : ''
                  }`}
                >
                  {turn.audio ? (
                    <PlayButton
                      label={playing === i ? t('library.transcript.stopPlaying') : playLabel(turn)}
                      state={playing === i ? 'playing' : 'idle'}
                      onPress={() => toggle(i)}
                    />
                  ) : null}
                  <TurnMenu
                    title={nameOf(turn)}
                    highlight={
                      turn.audio
                        ? {
                            label: t(
                              timings[i] && !timings[i]!.words.length
                                ? 'offlineLibrary.noTiming'
                                : 'offlineLibrary.highlight',
                            ),
                            disabled:
                              timingBusy !== null ||
                              (timings[i] !== undefined && !timings[i]!.words.length),
                            onPress: () => highlight(i),
                          }
                        : null
                    }
                    bookmarked={libraryTools ? annotation.bookmarked : null}
                    onBookmark={() => {
                      if (!libraryTools) return;
                      void libraryTools
                        .annotate(conversation.id, i, {
                          ...annotation,
                          bookmarked: !annotation.bookmarked,
                        })
                        .then(() => setRevision((value) => value + 1))
                        .catch(() => setNoteTurn(i));
                    }}
                    onNote={libraryTools ? () => setNoteTurn(i) : null}
                  />
                  {/* Every AI line can be reported (Google Play's AI-generated content policy). */}
                  {turn.speaker === 'persona' ? (
                    <FlagButton
                      label={t(flags.has('turn', i) ? 'flag.reported' : 'flag.openLine')}
                      flagged={flags.has('turn', i)}
                      onPress={() => setReporting(i)}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
      <NoteEditor
        key={noteTurn ?? 'closed'}
        visible={noteTurn !== null}
        annotation={annotations[String(noteTurn)] ?? { bookmarked: false, note: '' }}
        onClose={() => setNoteTurn(null)}
        save={async (value) => {
          if (noteTurn === null || !libraryTools) return;
          await libraryTools.annotate(conversation.id, noteTurn, value);
          setRevision((version) => version + 1);
        }}
      />
      <FlagSheet
        kind={reporting === null ? null : 'turn'}
        onSend={(reason, note) =>
          reporting === null
            ? Promise.reject(new Error('closed'))
            : flags.submit('turn', reporting, reason, note)
        }
        onClose={() => setReporting(null)}
      />
    </>
  );
}

/**
 * 5.6 Transcript: one past conversation as it was said, the partner on the left and the
 * learner on the right, with the way to its report. A recorded turn can be heard again; playing
 * goes on through the turns after it (spec §6.6).
 */
export function TranscriptScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { clock } = usePracticeServices();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reading = useConversation(id ?? '');

  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
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
    >
      {reading.phase === 'ready' ? (
        <Lines
          key={reading.transcript.conversation.id}
          transcript={reading.transcript}
          now={new Date(clock.now())}
        />
      ) : reading.phase === 'failed' && reading.code === 'not_found' ? (
        <NoticeBox icon="info">{t('library.transcript.notFound')}</NoticeBox>
      ) : (
        <LoadState
          failed={reading.phase === 'failed'}
          loadingLabel={t('library.transcript.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            reading.phase === 'failed' && reading.code === 'network'
              ? 'errors.network'
              : 'library.transcript.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={reading.retry}
        />
      )}
    </StepLayout>
  );
}
