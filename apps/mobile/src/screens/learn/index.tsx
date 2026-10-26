import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Card as Flashcard } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { TabHeader, TabScreen } from '@/components/tab-screen';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { reviewAloudRoute, reviewCallRoute, ROUTES } from '@/lib/routes';
import { useDeck, usePracticeServices, useSuggestedPartner } from '@/practice/services';
import { CardRow } from './card-row';
import { CardSheet } from './card-sheet';
import { dueLabel } from './due-label';
import { ReviewCard } from './review-card';

/** The card that comes back soonest among those not due yet; null when every card is due. */
function nextDue(cards: readonly Flashcard[], now: Date): string | null {
  const waiting = cards
    .map((card) => card.dueAt)
    .filter((dueAt) => Date.parse(dueAt) > now.getTime());
  return waiting.sort()[0] ?? null;
}

/**
 * 5.7 Learn: the learner's flashcards (spec §6.7). On top, how many are due and the button that
 * starts a review; under it the deck, newest first. Cards are made from a conversation's
 * report, so a learner without any is told where they come from. Above them, the way to the
 * grammar map (5.14), the Tutor (5.12) and the exam centre (5.16). The phrasebook of spec §14.1
 * is not built.
 */
export function LearnScreen() {
  const { t, i18n } = useTranslation();
  const { status } = useSession();
  const { deck: store, clock, readCard } = usePracticeServices();
  // A tapped word of the day opens its card (`learnCardRoute`).
  const { card: cardId } = useLocalSearchParams<{ card?: string }>();
  const deck = useDeck();
  const partner = useSuggestedPartner();
  const [open, setOpen] = useState<Flashcard | null>(null);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  useEffect(() => {
    if (!signedIn || !cardId) return;
    let live = true;
    // A card removed since the reminder was scheduled simply does not open.
    readCard(cardId).then(
      (card) => live && setOpen(card),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [signedIn, cardId, readCard]);

  // Coming back to the tab: a card may have been saved from a report, or reviewed, meanwhile.
  useFocusEffect(
    useCallback(() => {
      void store.refresh();
    }, [store]),
  );

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const now = new Date(clock.now());
  const cards = deck.items;
  const total = deck.summary?.total ?? 0;
  const next = nextDue(cards, now);
  return (
    <TabScreen onRefresh={deck.phase === 'ready' ? () => void store.refresh() : undefined}>
      <Reveal>
        <TabHeader title={t('learn.title')} body={total > 0 ? t('learn.body') : undefined} />
      </Reveal>
      <Reveal delay={staggerDelay(1)}>
        <View className="w-full max-w-content self-center">
          <ListGroup>
            <ListRow
              icon="target"
              title={t('learn.grammarRow')}
              detail={t('learn.grammarHint')}
              onPress={() => router.push(ROUTES.grammar)}
            />
            <ListRow
              icon="message"
              title={t('learn.tutorRow')}
              detail={t('learn.tutorHint')}
              onPress={() => router.push(ROUTES.tutor)}
            />
            <ListRow
              icon="award"
              title={t('learn.examsRow')}
              detail={t('learn.examsHint')}
              onPress={() => router.push(ROUTES.exams)}
            />
          </ListGroup>
        </View>
      </Reveal>
      {deck.phase !== 'ready' ? (
        <LoadState
          failed={deck.phase === 'failed'}
          loadingLabel={t('learn.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(deck.error === 'network' ? 'errors.network' : 'learn.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      ) : total === 0 ? (
        <EmptyState
          icon="book"
          title={t('learn.emptyTitle')}
          body={t('learn.emptyBody')}
          action={
            <Button label={t('learn.emptyAction')} onPress={() => router.navigate(ROUTES.talk)} />
          }
        />
      ) : (
        <View className="w-full max-w-content gap-6 self-center">
          <Reveal delay={staggerDelay(1)}>
            <ReviewCard
              due={deck.summary?.due ?? 0}
              next={next ? dueLabel(t, i18n.language, next, now) : null}
              onReview={() => {
                commitFeedback();
                router.push(ROUTES.review);
              }}
              onReviewAloud={() => {
                commitFeedback();
                router.push(reviewAloudRoute);
              }}
              onConverse={
                partner
                  ? () => {
                      commitFeedback();
                      router.push(reviewCallRoute(partner));
                    }
                  : null
              }
            />
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <Section title={t('learn.cards.title')} count={total}>
              <View className="gap-3">
                <ListGroup>
                  {cards.map((card) => (
                    <CardRow
                      key={card.id}
                      card={card}
                      due={dueLabel(t, i18n.language, card.dueAt, now)}
                      onPress={() => setOpen(card)}
                    />
                  ))}
                </ListGroup>
                {deck.moreFailed ? (
                  <NoticeBox icon="alert" tone="danger">
                    {t('learn.cards.moreFailed')}
                  </NoticeBox>
                ) : null}
                {deck.hasMore ? (
                  <Button
                    variant="secondary"
                    label={t('learn.cards.more')}
                    loading={deck.loadingMore}
                    onPress={() => void store.more()}
                  />
                ) : null}
              </View>
            </Section>
          </Reveal>
          <Text variant="small" tone="subtle" className="text-center">
            {t('learn.later')}
          </Text>
        </View>
      )}
      <CardSheet
        card={open}
        onClose={() => {
          setOpen(null);
          // Closed, it does not open again when the screen comes back.
          if (cardId) router.setParams({ card: undefined });
        }}
      />
    </TabScreen>
  );
}
