import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { AnsweredCard, Rating } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { RecordingNow } from '@/components/recording-now';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { ArticleWord, WordForms } from '@/components/word-forms';
import { waitOf } from '@/lib/card-times';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { backOr } from '@/lib/navigation';
import { blankWord } from '@/lib/word-use';
import { Listen } from '@/screens/learn/listen';
import { ROUTES } from '@/lib/routes';
import type { ReviewItem, ReviewState } from '@/practice';
import { usePracticeServices, useReviewSession } from '@/practice/services';
import { useTheme } from '@/theme';
import { useSpokenAttempt } from '@/voice/use-spoken-attempt';

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
            style={{ height: size.progressHeight }}
            className="flex-1 overflow-hidden rounded-sm bg-track"
          >
            <View
              style={{ width: `${((card.position - 1) / card.total) * 100}%` }}
              className="h-full rounded-sm bg-primary"
            />
          </View>
          <Text variant="fieldLabel" tone="subtle">
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

/**
 * One card: the side that asks, and under it, once it is shown, the answer. Answered out loud,
 * a word card asks the other way round: its meaning (and its own sentence with a gap) asks for
 * the word.
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
  const { card } = item;
  const article = card.details?.article ?? null;
  const askWord = aloud && card.kind === 'word';
  const gapped = askWord && card.note ? blankWord(card.note, card.front, language) : null;
  const ask = askWord
    ? t(article ? 'review.aloud.askNoun' : 'review.aloud.askWord')
    : t(`review.ask.${card.kind}`);
  return (
    <View className="flex-1 justify-center">
      <Card className="gap-5 p-5">
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="caption" tone="subtle" className="shrink">
            {ask}
          </Text>
          <Badge label={t(`learn.kind.${card.kind}`)} tone="surface" />
        </View>
        {askWord ? (
          <View className="gap-3">
            <Text variant="title" accessibilityRole="header">
              {card.back}
            </Text>
            {gapped ? (
              <View className="gap-0.5">
                <Text variant="caption" tone="subtle">
                  {t('review.aloud.fromConversation')}
                </Text>
                <Text variant="callout" tone="muted" className="italic">
                  {gapped}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          // A word stands large; a whole sentence a size smaller, so its answer stays in view.
          <ArticleWord
            text={card.front}
            article={article}
            variant={card.kind === 'word' ? 'title' : 'heading'}
            header
          />
        )}
        {revealed ? (
          <Reveal>
            <View accessibilityLiveRegion="polite" className="gap-2 border-t border-border pt-4">
              {answer ? <Heard answer={answer} /> : null}
              {askWord ? (
                <ArticleWord text={card.front} article={article} variant="emphasis" />
              ) : (
                <Text variant="emphasis" tone="primary">
                  {card.back}
                </Text>
              )}
              {card.note ? (
                <Text
                  variant="callout"
                  tone="muted"
                  className={card.kind === 'word' ? 'italic' : ''}
                >
                  {card.note}
                </Text>
              ) : null}
              {card.details ? <WordForms details={card.details} /> : null}
              <Listen cardId={card.id} />
            </View>
          </Reveal>
        ) : null}
      </Card>
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
                variant={rating === (suggested ?? 'good') ? 'primary' : 'secondary'}
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

/** The end of a sitting, with one success haptic for the moment. */
function Done({ reviewed }: { reviewed: number }) {
  const { t } = useTranslation();
  useEffect(() => successFeedback(), []);
  return (
    <EmptyState
      icon="check"
      title={t('review.done.title')}
      body={t('review.done.body', { count: reviewed })}
    />
  );
}

function Sitting({ aloud }: { aloud: boolean }) {
  const { t } = useTranslation();
  const { state, session } = useReviewSession();
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
              onRate={(rating) => void session.rate(rating)}
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
      {state.phase === 'card' ? (
        <>
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
        <Done reviewed={state.reviewed} />
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
