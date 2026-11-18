import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { AnsweredCard, Rating } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button, type ButtonVariant } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { Tile, TileChip } from '@/components/tile';
import { NoticeBox } from '@/components/notice-box';
import { RecordingNow } from '@/components/recording-now';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { ArticleWord, WordForms } from '@/components/word-forms';
import { waitOf } from '@/lib/card-times';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { blankWord } from '@/lib/word-use';
import { Listen } from '@/screens/learn/listen';
import { ROUTES } from '@/lib/routes';
import type { ReviewItem, ReviewState } from '@/practice';
import { usePracticeServices, useReviewSession } from '@/practice/services';
import { useTheme } from '@/theme';
import { useSpokenAttempt } from '@/voice/use-spoken-attempt';
import { FlipIn } from './flip';
import { OfflineReviewStatus } from './offline-status';

// The four answers, in the order they are laid out: two rows of two.
const RATINGS: readonly Rating[] = ['again', 'hard', 'good', 'easy'];

const leave = () => backOr(ROUTES.learn);

/** The top row: the way out and, during a sitting, how far along the learner is. */
function Header({ state }: { state: ReviewState }) {
  const { t } = useTranslation();
  const card = state.phase === 'card' ? state : null;
  return (
    <View className="min-h-tap flex-row items-center gap-3.5">
      <HeaderButton icon="close" label={t('review.close')} onPress={leave} />
      {card ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('review.progress', { current: card.position, total: card.total })}
          accessibilityValue={{ min: 0, max: card.total, now: card.position }}
          className="flex-1 flex-row items-center gap-3.5"
        >
          <View
            style={{ height: size.meterHeight }}
            className="flex-1 overflow-hidden rounded-pill bg-surface"
          >
            <View
              style={{ width: `${((card.position - 1) / card.total) * 100}%` }}
              className="h-full rounded-pill bg-primary"
            />
          </View>
          <Text variant="label" className="tabular-nums">
            {t('common.stepCounter', { current: card.position, total: card.total })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** How a card answered out loud was heard: right, almost (a noun's article), or not yet. */
function Heard({ answer }: { answer: AnsweredCard }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  return (
    <View className="gap-1">
      {answer.outcome === 'right' ? (
        <Pop>
          <View className="flex-row items-center gap-2">
            <Icon name="check" color={color.success} size={size.iconMd} />
            <Text variant="labelMedium">{t('review.aloud.outcome.right')}</Text>
          </View>
        </Pop>
      ) : (
        <Text variant="labelMedium" tone={answer.outcome === 'article' ? 'warn' : 'fg'}>
          {t(`review.aloud.outcome.${answer.outcome}`)}
        </Text>
      )}
      <Text variant="small" tone="muted">
        {answer.heard
          ? t('review.aloud.heard', { heard: answer.heard })
          : t('review.aloud.nothingHeard')}
      </Text>
    </View>
  );
}

/** "das Wochenende, neuter": what a screen reader says for a German noun with its article. */
function useWordLabel() {
  const { t } = useTranslation();
  return (text: string, article: string | null) =>
    (article === 'der' || article === 'die' || article === 'das') &&
    text.toLowerCase().startsWith(`${article} `)
      ? `${text}, ${t(`learn.gender.${article}`)}`
      : undefined;
}

/**
 * One card (v4): the side that asks is pink, the word set in the language's serif; showing the
 * answer flips it to the white side, where the article takes its gender's colour (on pink it
 * would be too faint to read). Answered out loud, a word card asks the other way round: its
 * meaning (and its own sentence with a gap) asks for the word.
 */
function Flashcard({
  item,
  revealed,
  aloud,
  language,
  answer,
}: {
  item: ReviewItem;
  revealed: boolean;
  aloud: boolean;
  language: string;
  answer: AnsweredCard | null;
}) {
  const { t } = useTranslation();
  const wordLabel = useWordLabel();
  const { card } = item;
  const article = card.details?.article ?? null;
  const askWord = aloud && card.kind === 'word';
  const gapped = askWord && card.note ? blankWord(card.note, card.front, language) : null;
  const ask = askWord
    ? t(article ? 'review.aloud.askNoun' : 'review.aloud.askWord')
    : t(`review.ask.${card.kind}`);
  const kind = t(`learn.kind.${card.kind}`);
  if (!revealed) {
    return (
      <View className="flex-1 justify-center">
        <Tile color="pink" className="min-h-64 items-center justify-center gap-4 p-6">
          <TileChip>
            <Text variant="captionStrong" tone="onPink">
              {kind}
            </Text>
          </TileChip>
          {askWord ? (
            <View className="items-center gap-3">
              <Text
                variant="title"
                tone="onPink"
                accessibilityRole="header"
                className="text-center"
              >
                {card.back}
              </Text>
              {gapped ? (
                <View className="items-center gap-0.5">
                  <Text variant="caption" tone="onPink">
                    {t('review.aloud.fromConversation')}
                  </Text>
                  <Text variant="langBody" tone="onPink" className="text-center">
                    {gapped}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            // A word stands large; a whole sentence a size smaller, so it fits a small phone.
            <Text
              variant={card.kind === 'word' ? 'langWord' : 'langLarge'}
              tone="onPink"
              accessibilityRole="header"
              accessibilityLabel={wordLabel(card.front, article)}
              className="text-center"
            >
              {card.front}
            </Text>
          )}
          <Text variant="overline" tone="onPink" className="text-center">
            {ask}
          </Text>
        </Tile>
      </View>
    );
  }
  return (
    <View className="flex-1 justify-center">
      <FlipIn>
        <View
          accessibilityLiveRegion="polite"
          className="min-h-64 items-center justify-center gap-4 rounded-hero border-2 border-border bg-chip p-6"
        >
          {answer ? <Heard answer={answer} /> : null}
          <ArticleWord
            text={card.front}
            article={article}
            variant={card.kind === 'word' ? 'langLarge' : 'langBody'}
            header={!askWord}
          />
          {askWord ? null : (
            <Text variant="title" className="text-center">
              {card.back}
            </Text>
          )}
          {card.note ? (
            <Text
              variant={card.kind === 'word' ? 'langBody' : 'callout'}
              tone="muted"
              className="text-center"
            >
              {card.note}
            </Text>
          ) : null}
          {card.details ? <WordForms details={card.details} /> : null}
          <Listen cardId={card.id} />
        </View>
      </FlipIn>
    </View>
  );
}

/** Why an answer out loud failed, as the screen says it; any other reason reads "unavailable". */
const FAILURE_KEY = {
  mic_denied: 'conversation.problems.mic_denied',
  answer_limit: 'review.aloud.failed.limit',
  consent_required: 'review.aloud.failed.consent',
  network: 'errors.network',
} as const;

const failureKey = (code: string) =>
  code in FAILURE_KEY
    ? FAILURE_KEY[code as keyof typeof FAILURE_KEY]
    : 'review.aloud.failed.unavailable';

/**
 * The way to answer a card out loud: record, stop, and the card turns over with how it was
 * heard. Showing the answer stays possible at every step but recording.
 */
function AloudActions({
  cardId,
  onAnswered,
  onShow,
}: {
  cardId: string;
  onAnswered: (answer: AnsweredCard) => void;
  onShow: () => void;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { answerCard } = usePracticeServices();
  const { step, record, stop, reset } = useSpokenAttempt(
    (recording) => answerCard(cardId, recording),
    (answer) => {
      if (answer.outcome === 'right') successFeedback();
      onAnswered(answer);
    },
  );
  const show = <TextButton tone="primary" label={t('review.show')} onPress={onShow} />;
  if (step.kind === 'recording') {
    return (
      <RecordingNow
        label={t('review.aloud.recording')}
        hint={t('review.aloud.recordingHint')}
        stopLabel={t('review.aloud.stop')}
        onStop={() => void stop()}
      />
    );
  }
  if (step.kind === 'checking' || step.kind === 'heard') {
    return (
      <Text tone="muted" accessibilityLiveRegion="polite" className="text-center">
        {t('review.aloud.checking')}
      </Text>
    );
  }
  if (step.kind === 'failed') {
    return (
      <View className="gap-3">
        <NoticeBox icon="alert" tone="danger">
          {t(failureKey(step.code))}
        </NoticeBox>
        <Button label={t('review.aloud.again')} onPress={reset} />
        {show}
      </View>
    );
  }
  return (
    <View className="gap-2">
      <Button
        label={t('review.aloud.answer')}
        leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
        onPress={() => void record()}
      />
      {show}
    </View>
  );
}

/**
 * v4 colours the answers: "Easy" is ink, the expected one (Good, or what an answer out loud
 * suggests) is lime, the rest are soft.
 */
function ratingLook(rating: Rating, suggested: Rating | null): ButtonVariant {
  if (rating === (suggested ?? 'good')) return 'lime';
  // As on the v4 prototype: Hard butter, Easy ink, Again soft.
  return rating === 'easy' ? 'primary' : rating === 'hard' ? 'butter' : 'secondary';
}

/** A wait in words ("10 min", "2 days"). */
function useWaitText() {
  const { t } = useTranslation();
  return (seconds: number) => {
    const { unit, count } = waitOf(seconds);
    return t(`review.in.${unit}`, { count });
  };
}

/**
 * The four answers to "how well did you know it?", each with when it brings the card back. A
 * card that came back within the sitting has no times: they were read before it was rated.
 */
function Ratings({
  item,
  saving,
  suggested,
  onRate,
}: {
  item: ReviewItem;
  saving: boolean;
  /** The rating an answer out loud points to; it stands out, as "Good" does otherwise. */
  suggested: Rating | null;
  onRate: (rating: Rating) => void;
}) {
  const { t } = useTranslation();
  const waitText = useWaitText();
  return (
    <View className="gap-2.5">
      <Text variant="small" tone="muted" className="text-center">
        {t('review.rateTitle')}
      </Text>
      <View className="flex-row flex-wrap gap-2.5">
        {RATINGS.map((rating) => {
          const label = t(`review.rating.${rating}`);
          const wait = item.dueIn ? waitText(item.dueIn[rating] ?? 0) : undefined;
          const named = wait ? t('review.ratingLabel', { rating: label, when: wait }) : label;
          const proposed = suggested === rating;
          return (
            // Two to a row: four across would break their words on a narrow phone.
            <View key={rating} className="min-w-[45%] flex-1">
              <Button
                variant={ratingLook(rating, suggested)}
                label={label}
                detail={wait}
                accessibilityLabel={
                  proposed ? t('review.aloud.suggested', { label: named }) : named
                }
                disabled={saving}
                onPress={() => {
                  commitFeedback();
                  onRate(rating);
                }}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** The end of a sitting (v4): a big line and stickers, with one success haptic for the moment. */
function Done({ reviewed, best }: { reviewed: number; best: number }) {
  const { t } = useTranslation();
  useEffect(() => successFeedback(), []);
  return (
    <View className="w-full max-w-content flex-1 justify-center gap-5 self-center py-6">
      <Reveal>
        <View className="gap-2">
          <Text variant="hero" accessibilityRole="header">
            {t('review.done.title')}
          </Text>
          <Text tone="muted">{t('review.done.body', { count: reviewed })}</Text>
        </View>
      </Reveal>
      <View className="flex-row flex-wrap gap-2.5" aria-hidden>
        <Sticker color="pink" delay={staggerDelay(2)} value={reviewed}>
          {t('review.done.reviewed', { count: reviewed })}
        </Sticker>
        {best >= 2 ? (
          <Sticker color="butter" delay={staggerDelay(3)} value={best}>
            {t('review.done.best')}
          </Sticker>
        ) : null}
      </View>
    </View>
  );
}

function Sticker({
  color,
  value,
  delay,
  children,
}: {
  color: 'pink' | 'butter';
  value: number;
  delay: number;
  children: string;
}) {
  const tone = color === 'pink' ? 'onPink' : 'onButter';
  return (
    <View className="min-w-[40%] flex-1">
      <Pop delay={delay}>
        <Tile color={color} className="gap-0.5 rounded-card px-4 py-3">
          <Text variant="stat" tone={tone}>
            {value}
          </Text>
          <Text variant="small" tone={tone}>
            {children}
          </Text>
        </Tile>
      </Pop>
    </View>
  );
}

/**
 * How many cards in a row the learner knew (Good or Easy), counted from their own answers in
 * this sitting: a card counts once it is saved and the next one shows.
 */
function useRun(state: ReviewState) {
  const rated = useRef<Rating | null>(null);
  const [run, setRun] = useState({ now: 0, best: 0 });
  const position = state.phase === 'card' ? state.position : null;
  const finished = state.phase === 'done';
  useEffect(() => {
    const rating = rated.current;
    if (rating === null) return;
    rated.current = null;
    const knew = rating === 'good' || rating === 'easy';
    setRun((r) => {
      const now = knew ? r.now + 1 : 0;
      return { now, best: Math.max(r.best, now) };
    });
  }, [position, finished]);
  return { ...run, rate: (rating: Rating) => (rated.current = rating) };
}

/** "3 in a row": shown from the second known card on. */
function RunChip({ count }: { count: number }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  if (count < 2) return null;
  return (
    <Pop key={count} style={{ alignSelf: 'center' }}>
      <View className="min-h-8 flex-row items-center gap-1.5 rounded-pill bg-butter px-3.5 py-1">
        <Icon name="flame" color={color.onButter} size={size.icon} />
        <Text variant="labelSmall" tone="onButter">
          {t('review.combo', { count })}
        </Text>
      </View>
    </Pop>
  );
}

function Sitting({ aloud }: { aloud: boolean }) {
  const { t } = useTranslation();
  const { state, session } = useReviewSession();
  const run = useRun(state);
  const backToLearn = <Button label={t('review.back')} onPress={leave} />;
  return (
    <StepLayout
      header={<Header state={state} />}
      actions={
        state.phase === 'card' ? (
          state.revealed ? (
            <Ratings
              item={state.item}
              saving={state.saving}
              suggested={state.answer?.suggested ?? null}
              onRate={(rating) => {
                run.rate(rating);
                void session.rate(rating);
              }}
            />
          ) : aloud ? (
            // A new card starts with the microphone off.
            <AloudActions
              key={`${state.item.card.id}-${state.position}`}
              cardId={state.item.card.id}
              onAnswered={(answer) => session.reveal(answer)}
              onShow={() => session.reveal()}
            />
          ) : (
            <Button label={t('review.show')} onPress={() => session.reveal()} />
          )
        ) : state.phase === 'done' || state.phase === 'empty' ? (
          backToLearn
        ) : undefined
      }
    >
      <OfflineReviewStatus revision={state} />
      {state.phase === 'card' ? (
        <>
          <RunChip count={run.now} />
          {/* A new card enters; the same card showing its answer stays where it is. */}
          <Reveal key={`${state.item.card.id}-${state.position}`} style={{ flex: 1 }}>
            <Flashcard
              item={state.item}
              revealed={state.revealed}
              aloud={aloud}
              language={state.language}
              answer={state.answer}
            />
          </Reveal>
          {state.error ? (
            <NoticeBox icon="alert" tone="danger">
              {t('review.saveFailed')}
            </NoticeBox>
          ) : null}
        </>
      ) : state.phase === 'done' ? (
        <Done reviewed={state.reviewed} best={run.best} />
      ) : state.phase === 'empty' ? (
        <EmptyState icon="check" title={t('review.empty.title')} body={t('review.empty.body')} />
      ) : (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('review.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            state.phase === 'failed' && state.code === 'network'
              ? 'errors.network'
              : 'review.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={() => void session.start()}
        />
      )}
    </StepLayout>
  );
}

/**
 * 5.11 Review: the flashcards that are due, one at a time (spec §6.7). The learner looks at a
 * card, shows its answer and says how well they knew it; the server decides when the card
 * comes back, and each answer says when that would be. A card that was not known returns once
 * more at the end of the sitting.
 *
 * Opened with `aloud` (voice review), each card is answered out loud: the server hears the
 * answer, says how close it came and suggests a rating, which the learner still gives.
 */
export function ReviewScreen() {
  const { status } = useSession();
  const { aloud } = useLocalSearchParams<{ aloud?: string }>();
  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  return <Sitting aloud={aloud === '1'} />;
}
