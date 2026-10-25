import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Home } from '@konvami/api-client';
import { useSession } from '@/auth';
import { AccountButton } from '@/components/account-button';
import { Card } from '@/components/card';
import { ConversationRow } from '@/components/conversation-row';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { Section } from '@/components/section';
import { TabHeader, TabScreen } from '@/components/tab-screen';
import { TextButton } from '@/components/text-button';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { formatDayLine } from '@/lib/format';
import { dayPart } from '@/lib/greeting';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { sessionRoute } from '@/lib/plan';
import { callRoute, conversationRoute, ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';
import { useAccount } from '@/profile/services';
import { ExamCard } from './exam-card';
import { FocusCard } from './focus-card';
import { LevelCard } from '@/components/level-card';
import { TalkCard } from './talk-card';
import { WeekCard } from './week-card';

/** The greeting and the day, with the way to the account at the end. */
function Header({ now }: { now: Date }) {
  const { t, i18n } = useTranslation();
  const { user } = useSession();
  const { pictureUrl } = useAccount();
  const name = user?.firstName ?? '';
  const part = dayPart(now.getHours());
  return (
    <TabHeader
      overline={formatDayLine(i18n.language, now)}
      title={name ? t(`today.greeting.${part}`, { name }) : t(`today.greetingNoName.${part}`)}
      trailing={
        <AccountButton
          name={name}
          pictureUrl={pictureUrl}
          label={t('today.account')}
          onPress={() => router.push(ROUTES.account)}
        />
      }
    />
  );
}

function Day({ home, now }: { home: Home; now: Date }) {
  const { t } = useTranslation();
  const { split } = useScreenLayout();
  const partner =
    home.partners.find(({ persona }) => persona.id === home.suggestedPartnerId) ?? home.partners[0];

  // The cards in reading order; each one enters a beat after the one before it.
  const talk = [
    partner ? (
      <TalkCard
        key="talk"
        partner={partner}
        plan={home.plan}
        now={now}
        hasOthers={home.partners.length > 1}
        onTalk={() => {
          commitFeedback();
          router.push(callRoute(partner.persona.id));
        }}
        onPlanned={(session) => {
          commitFeedback();
          router.push(sessionRoute(session, partner.persona.id));
        }}
        onOthers={() => router.navigate(ROUTES.talk)}
      />
    ) : null,
    // Shown only while cards are waiting: a count of zero is nothing to do.
    home.cardsDue > 0 ? (
      <ListGroup key="cards">
        <ListRow
          icon="book"
          title={t('today.cards.title', { count: home.cardsDue })}
          detail={t('today.cards.body')}
          onPress={() => router.push(ROUTES.review)}
        />
      </ListGroup>
    ) : null,
    <WeekCard
      key="week"
      activity={home.activity}
      plan={home.plan}
      onChangeGoal={() => router.push(ROUTES.accountGoals)}
    />,
  ];
  const about = [
    home.level ? <LevelCard key="level" level={home.level} /> : null,
    home.focus.length ? (
      <FocusCard key="focus" focus={home.focus} source={home.focusSource} />
    ) : null,
    home.exam ? (
      <ExamCard
        key="exam"
        exam={home.exam}
        week={home.plan.exam}
        onOpen={() => router.push(ROUTES.exams)}
      />
    ) : null,
    home.recent.length ? (
      <Section
        key="recent"
        title={t('today.recent.title')}
        action={
          <TextButton
            tone="primary"
            label={t('today.recent.all')}
            onPress={() => router.navigate(ROUTES.library)}
          />
        }
      >
        <Card className="px-3.5 py-1">
          {home.recent.map((conversation, i) => (
            <View key={conversation.id} className={i > 0 ? 'border-t border-border' : ''}>
              <ConversationRow
                conversation={conversation}
                now={now}
                onPress={() => router.push(conversationRoute(conversation.id))}
              />
            </View>
          ))}
        </Card>
      </Section>
    ) : null,
  ];

  const column = (cards: (React.JSX.Element | null)[], first: number) => (
    // Side by side the columns share the width; stacked, each is as tall as its cards.
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

  // Side by side on wide windows: talking on the left, the learner's standing on the right.
  return (
    <View className={split ? 'flex-row items-start gap-6' : 'gap-4'}>
      {column(talk, 1)}
      {column(about, 1 + talk.length)}
    </View>
  );
}

/**
 * 5.1 Today: where a learner lands. One button starts a conversation; under it, this week, the
 * level, what to polish, the exam ahead and the latest conversations. Every number is the
 * learner's own: what does not exist yet is left out.
 */
export function TodayScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { home: store, clock } = usePracticeServices();
  const home = useHome();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  // Coming back to the tab after a while (a new day, a conversation on another device).
  useFocusEffect(
    useCallback(() => {
      void store.revisit();
    }, [store]),
  );

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const now = new Date(clock.now());
  return (
    <TabScreen
      refreshing={home.refreshing}
      onRefresh={home.phase === 'ready' ? () => void store.refresh() : undefined}
    >
      <Reveal>
        <Header now={now} />
      </Reveal>
      {home.phase === 'ready' ? (
        <Day home={home.data} now={now} />
      ) : (
        <LoadState
          failed={home.phase === 'failed'}
          loadingLabel={t('today.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(home.error === 'network' ? 'errors.network' : 'today.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      )}
    </TabScreen>
  );
}
