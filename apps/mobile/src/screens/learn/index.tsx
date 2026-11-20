import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Card as Flashcard } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ListGroup } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { TabScreen } from '@/components/tab-screen';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { reviewAloudRoute, reviewCallRoute, ROUTES } from '@/lib/routes';
import { useDeck, usePracticeServices, useSuggestedPartner } from '@/practice/services';
import { OfflineReviewStatus } from '@/screens/review/offline-status';
import { CardRow } from './card-row';
import { CardSheet } from './card-sheet';
import { dueLabel } from './due-label';
import { DeckExport } from './deck-export';
import { DeckStats } from './deck-stats';
import { ReviewCard } from './review-card';
import { LearnTools } from './tools';

// From this text size on, the tools stand one to a row (their names would break otherwise).
const LARGE_TEXT = 1.3;

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
 * report, so a learner without any is told where they come from. v4: the due cards on a pink
 * tile, the deck in numbers, then the tools as cards: the grammar map (5.14), the Tutor (5.12),
 * the phrasebook (5.19), the pronunciation lab (5.22), the exam centre (5.16) and the course
 * companion (5.23).
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
  const { compact } = useScreenLayout();
  const { fontScale } = useWindowDimensions();

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
  // Two tools to a row, one on a narrow phone or at large text sizes.
  const columns = compact || fontScale >= LARGE_TEXT ? 1 : 2;
  return (
    <TabScreen onRefresh={deck.phase === 'ready' ? () => void store.refresh() : undefined}>
      <Reveal>
        <View className="gap-1.5">
          <Text variant="overline" tone="subtle" accessibilityRole="header">
            {t('learn.title')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('learn.headline')}
          </Text>
          {total > 0 ? <Text tone="muted">{t('learn.body')}</Text> : null}
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
          {/* Ratings given offline that are still on the phone, with a way to send them. */}
          <OfflineReviewStatus revision={deck} />
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
            <View className="gap-2">
              <DeckStats total={total} due={deck.summary?.due ?? 0} />
              {/* Once the learner's reviews were fitted (spec §6.7): said once, quietly. */}
              {deck.summary?.tuned ? (
                <Text variant="small" tone="subtle">
                  {t('learn.tuned')}
                </Text>
              ) : null}
            </View>
          </Reveal>
          <LearnTools first={3} columns={columns} />
          <Reveal delay={staggerDelay(9)}>
            <DeckExport />
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
      {deck.phase === 'ready' && total > 0 ? null : (
        <View className="w-full max-w-content self-center">
          <LearnTools first={2} columns={columns} />
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
