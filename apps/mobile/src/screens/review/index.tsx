import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Rating } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { ArticleWord, WordForms } from '@/components/word-forms';
import { waitOf } from '@/lib/card-times';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { backOr } from '@/lib/navigation';
import { Listen } from '@/screens/learn/listen';
import { ROUTES } from '@/lib/routes';
import type { ReviewItem, ReviewState } from '@/practice';
import { useReviewSession } from '@/practice/services';

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

/** One card: the side that asks, and under it, once it is shown, the answer. */
function Flashcard({ item, revealed }: { item: ReviewItem; revealed: boolean }) {
  const { t } = useTranslation();
  const { card } = item;
  return (
    <View className="flex-1 justify-center">
      <Card className="gap-5 p-5">
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="caption" tone="subtle" className="shrink">
            {t(`review.ask.${card.kind}`)}
          </Text>
          <Badge label={t(`learn.kind.${card.kind}`)} tone="surface" />
        </View>
        {/* A word stands large; a whole sentence a size smaller, so its answer stays in view. */}
        <ArticleWord
          text={card.front}
          article={card.details?.article ?? null}
          variant={card.kind === 'word' ? 'title' : 'heading'}
          header
        />
        {revealed ? (
          <Reveal>
            <View accessibilityLiveRegion="polite" className="gap-2 border-t border-border pt-4">
              <Text variant="emphasis" tone="primary">
                {card.back}
              </Text>
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
  onRate,
}: {
  item: ReviewItem;
  saving: boolean;
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
          return (
            // Two to a row: four across would break their words on a narrow phone.
            <View key={rating} className="min-w-[45%] flex-1">
              <Button
                variant={rating === 'good' ? 'primary' : 'secondary'}
                label={label}
                detail={wait}
                accessibilityLabel={
                  wait ? t('review.ratingLabel', { rating: label, when: wait }) : label
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

function Sitting() {
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
              onRate={(rating) => void session.rate(rating)}
            />
          ) : (
            <Button label={t('review.show')} onPress={session.reveal} />
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
            <Flashcard item={state.item} revealed={state.revealed} />
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
 */
export function ReviewScreen() {
  const { status } = useSession();
  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  return <Sitting />;
}
