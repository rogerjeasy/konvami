import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Progress } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LevelCard } from '@/components/level-card';
import { LoadState } from '@/components/load-state';
import { Meter } from '@/components/meter';
import { Reveal } from '@/components/motion';
import { TabHeader, TabScreen } from '@/components/tab-screen';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { formatPercent } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { usePracticeServices, useProgress } from '@/practice/services';
import { Milestones } from './milestones';
import { PolishCard } from './polish-card';
import { PracticeCard } from './practice-card';

// Stands between the two counts of the deck ("12 cards · 3 due").
const SEPARATOR = ' · ';

/** How much of the talking in the last month's conversations was the learner's. */
function TalkCard({ talk }: { talk: NonNullable<Progress['talk']> }) {
  const { t, i18n } = useTranslation();
  const share = talk.learnerWords / (talk.learnerWords + talk.partnerWords);
  const percent = formatPercent(i18n.language, share);
  return (
    <Card className="gap-2.5 p-4">
      <Text variant="overline" tone="subtle" accessibilityRole="header">
        {t('report.share.title')}
      </Text>
      <Meter share={share} value={percent} label={t('report.share.label', { percent })} />
      <Text variant="small" tone="muted">
        {t('progress.talk.body')}
      </Text>
    </Card>
  );
}

/** The deck in a line, how many of the last month's reviews were remembered, and the way in. */
function CardsCard({ cards }: { cards: Progress['cards'] }) {
  const { t, i18n } = useTranslation();
  const summary = [
    t('progress.cards.total', { count: cards.total }),
    t('progress.cards.due', { count: cards.due }),
  ].join(SEPARATOR);
  const share = cards.reviews > 0 ? cards.remembered / cards.reviews : 0;
  const percent = formatPercent(i18n.language, share);
  return (
    <Card className="gap-3 p-4">
      <View className="gap-1">
        <Text variant="overline" tone="subtle" accessibilityRole="header">
          {t('progress.cards.title')}
        </Text>
        <Text variant="label">{summary}</Text>
      </View>
      {cards.reviews > 0 ? (
        <View className="gap-2">
          <Meter
            share={share}
            value={percent}
            label={t('progress.cards.remembered', { percent })}
          />
          <Text variant="small" tone="muted">
            {t('progress.cards.remembered', { percent })}
          </Text>
        </View>
      ) : (
        <Text variant="small" tone="muted">
          {t('progress.cards.noReviews')}
        </Text>
      )}
      <View className="items-start">
        <TextButton
          tone="primary"
          label={t('progress.cards.open')}
          onPress={() => router.navigate(ROUTES.learn)}
        />
      </View>
    </Card>
  );
}

/** Everything that is charted, in reading order; side by side on wide windows. */
function Charts({ progress }: { progress: Progress }) {
  const { split } = useScreenLayout();
  // Mistakes and the share of the talking come from reports: before the first one, neither
  // part has anything to say.
  const reported = progress.talk !== null;
  const practice = [
    <PracticeCard key="practice" progress={progress} />,
    progress.level ? <LevelCard key="level" level={progress.level} /> : null,
    progress.talk ? <TalkCard key="talk" talk={progress.talk} /> : null,
  ];
  const learning = [
    reported ? <PolishCard key="polish" mistakes={progress.mistakes} /> : null,
    progress.cards.total > 0 ? <CardsCard key="cards" cards={progress.cards} /> : null,
    <Milestones key="milestones" milestones={progress.milestones} />,
  ];
  const column = (cards: (React.JSX.Element | null)[], first: number) => (
    <View className={split ? 'flex-1 gap-4' : 'gap-4'}>
      {cards
        .filter((card) => card !== null)
        .map((card, i) => (
          <Reveal key={card.key} delay={staggerDelay(first + i)}>
            {card}
          </Reveal>
        ))}
    </View>
  );
  return (
    <View className={split ? 'flex-row items-start gap-6' : 'gap-4'}>
      {column(practice, 1)}
      {column(learning, 1 + practice.length)}
    </View>
  );
}

/**
 * 5.8 Progress: what a learner's practice adds up to (spec §6.15). Minutes and conversations
 * with the last weeks as a chart, the level, the share of the talking, the kinds of mistake
 * their reports confirmed week by week, how their cards are going, and milestones. Every number
 * is counted from what they did: a part with nothing behind it is left out, and a learner who
 * has not talked yet is told what will be here.
 */
export function ProgressScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { progress: store } = usePracticeServices();
  const progress = useProgress();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  // Coming back to the tab after a conversation or a review: the numbers have moved.
  useFocusEffect(
    useCallback(() => {
      void store.refresh();
    }, [store]),
  );

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const data = progress.data;
  const started = data !== null && (data.activity.conversations > 0 || data.cards.total > 0);
  return (
    <TabScreen
      refreshing={progress.refreshing}
      onRefresh={progress.phase === 'ready' ? () => void store.refresh() : undefined}
    >
      <Reveal>
        <TabHeader title={t('progress.title')} body={started ? t('progress.body') : undefined} />
      </Reveal>
      {data === null ? (
        <LoadState
          failed={progress.phase === 'failed'}
          loadingLabel={t('progress.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(progress.error === 'network' ? 'errors.network' : 'progress.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      ) : started ? (
        <Charts progress={data} />
      ) : (
        <EmptyState
          icon="barChart"
          title={t('progress.emptyTitle')}
          body={t('progress.emptyBody')}
          action={
            <Button
              label={t('progress.emptyAction')}
              onPress={() => router.navigate(ROUTES.talk)}
            />
          }
        />
      )}
    </TabScreen>
  );
}
