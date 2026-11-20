import { useCallback, useEffect, useState } from 'react';
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
import { TabScreen } from '@/components/tab-screen';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { formatDayLine } from '@/lib/format';
import { dayPart } from '@/lib/greeting';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { sessionRoute } from '@/lib/plan';
import { useChainHub } from '@/chain/services';
import {
  callRoute,
  chainTurnRoute,
  conversationRoute,
  penPalRoute,
  radioEpisodeRoute,
  ROUTES,
} from '@/lib/routes';
import { useRadioHub } from '@/radio/services';
import {
  useCoach,
  useHome,
  useMotivation,
  usePenPal,
  usePracticeServices,
} from '@/practice/services';
import { useAccount, useProfileQuestion, useProfileServices } from '@/profile/services';
import { useReminderSchedule } from '@/reminders/use-reminders';
import { useWidgetTimeline } from '@/widgets/use-widget';
import { CoachCard } from './coach-card';
import { ExamCard } from './exam-card';
import { FocusCard } from './focus-card';
import { isKnownQuestion, ProfileQuestion } from './profile-question';
import { RealLifeCard, useRealLifeOffer } from './real-life-card';
import { CallsOffer, ReminderOffer } from './reminder-offer';
import { LevelCard } from '@/components/level-card';
import { TalkCard } from './talk-card';
import { CardsTile } from './cards-tile';
import { GoalTile, StreakTile, TopicsTile } from './week-card';
import { QuestsCard, RecapCard, RepairCard, WelcomeBackCard } from './motivation-cards';
import { useRecapClosed } from './use-recap-closed';
import { Celebrations } from '@/screens/quests/celebrations';

// "Pause reminders for a month": the longest pause the server allows.
const PAUSE_DAYS = 30;

// Partner calls are offered after this many conversations (5.28), not with the first reminder.
const CALLS_OFFER_AFTER = 3;

/** The greeting and the day, with the way to the account at the end. */
function Header({ now }: { now: Date }) {
  const { t, i18n } = useTranslation();
  const { user } = useSession();
  const { pictureUrl } = useAccount();
  const name = user?.firstName ?? '';
  const part = dayPart(now.getHours());
  // v4: the greeting is the biggest thing on the screen, the date above it.
  return (
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1 gap-2">
        <Text variant="overline" tone="subtle">
          {formatDayLine(i18n.language, now)}
        </Text>
        <Text variant="hero" accessibilityRole="header">
          {name ? t(`today.greeting.${part}`, { name }) : t(`today.greetingNoName.${part}`)}
        </Text>
      </View>
      <AccountButton
        name={name}
        pictureUrl={pictureUrl}
        label={t('today.account')}
        onPress={() => router.push(ROUTES.account)}
      />
    </View>
  );
}

/**
 * The colour blocks under the talk card, two to a row (one on a narrow phone): the streak, the
 * week's goal, the cards waiting and the week's topics. A block with nothing to say is left out,
 * and the one left alone in a row takes its width.
 */
function Bento({ home, restDay }: { home: Home; restDay: boolean }) {
  const { compact } = useScreenLayout();
  const tiles = [
    <StreakTile key="streak" activity={home.activity} restDay={restDay} />,
    <GoalTile key="goal" plan={home.plan} onChangeGoal={() => router.push(ROUTES.accountGoals)} />,
    // Shown only while cards are waiting: a count of zero is nothing to do.
    home.cardsDue > 0 ? (
      <CardsTile key="cards" count={home.cardsDue} onPress={() => router.push(ROUTES.review)} />
    ) : null,
    home.plan.topics.length ? <TopicsTile key="topics" plan={home.plan} /> : null,
  ].filter((tile) => tile !== null);
  const perRow = compact ? 1 : 2;
  const rows: React.JSX.Element[][] = [];
  for (let i = 0; i < tiles.length; i += perRow) rows.push(tiles.slice(i, i + perRow));
  return (
    <View className="gap-3">
      {rows.map((row) => (
        <View key={row.map((tile) => tile.key).join('-')} className="flex-row items-stretch gap-3">
          {row}
        </View>
      ))}
    </View>
  );
}

function Day({ home, now }: { home: Home; now: Date }) {
  const { t } = useTranslation();
  const { split } = useScreenLayout();
  // The Coach's day: its first suggestion on Today, and in the next reminder.
  const coachState = useCoach();
  const coach = coachState.phase === 'ready' ? coachState.data : null;
  const motivation = useMotivation();
  const moving = motivation.phase === 'ready' ? motivation.data : null;
  // Today is where the plan is read: the device's reminders and widget follow it from here (no
  // reminders while the learner paused them).
  useReminderSchedule(home, now, coach, moving?.remindersPausedUntil ?? null);
  useWidgetTimeline(home, now);
  const [pauseFailed, setPauseFailed] = useState(false);
  const partner =
    home.partners.find(({ persona }) => persona.id === home.suggestedPartnerId) ?? home.partners[0];
  // A question about a setting, when the server finds one due (progressive profiling).
  const question = useProfileQuestion();
  // A partner's voice note waiting to be opened (spec §14.1).
  const penPal = usePenPal();
  // Radio Konvami (8.1): a card when the learner's call aired in a show of the last two days.
  const { status: session } = useSession();
  const radio = useRadioHub(session === 'signedIn');
  const aired = radio.state.phase === 'ready' ? radio.state.data.aired : null;
  const waiting =
    penPal.phase === 'ready' ? penPal.data.threads.find((thread) => thread.unread > 0) : undefined;
  const writer = waiting
    ? home.partners.find(({ persona }) => persona.id === waiting.personaId)?.persona
    : undefined;
  // 9.12 A story of the story chain waiting for the learner's line.
  const chain = useChainHub();
  const chainTurn =
    chain.state.phase === 'ready' && chain.state.data.available
      ? chain.state.data.stories.find((story) => story.next === 'record')
      : undefined;
  // An event of the learner's life to rehearse, or to talk over (spec §7).
  const lifeOffer = useRealLifeOffer(home.partners, now);
  const { pauseReminders } = usePracticeServices();
  const pause = (days: number | null) => {
    setPauseFailed(false);
    void pauseReminders(days).catch(() => setPauseFailed(true));
  };
  const recapWeek = moving?.recap?.week ?? null;
  const recap = useRecapClosed(recapWeek);
  const welcomeName =
    home.partners.find(({ persona }) => persona.id === moving?.welcomeBack?.partnerId)?.persona
      .name ?? partner?.persona.name;
  const milestoneName = (id: string) =>
    t(`progress.milestones.names.${id}` as 'progress.milestones.title', { defaultValue: id });
  const asking =
    question.phase === 'ready' &&
    question.data.question !== null &&
    isKnownQuestion(question.data.question.id);

  // The Coach comes before the week's plan only when it leads (an exam close with no recent
  // simulation); otherwise right after it. A Coach that cannot be read leaves Today as it was.
  const coachCard = coach ? <CoachCard key="coach" coach={coach} /> : null;
  // The cards in reading order; each one enters a beat after the one before it.
  const talk = [
    coach?.leads ? coachCard : null,
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
    coach?.leads ? null : coachCard,
    waiting && writer ? (
      <ListGroup key="pen-pal">
        <ListRow
          icon="mic"
          title={t('penPal.today.title', { name: writer.name })}
          detail={t('penPal.today.body')}
          onPress={() => router.push(penPalRoute(writer.id))}
        />
      </ListGroup>
    ) : null,
    aired ? (
      <ListGroup key="radio">
        <ListRow
          icon="radio"
          title={t('radio.today_card.title')}
          detail={t('radio.today_card.body')}
          onPress={() => router.push(radioEpisodeRoute(aired.id))}
        />
      </ListGroup>
    ) : null,
    chainTurn ? (
      <ListGroup key="chain">
        <ListRow
          icon="book"
          title={t('chain.today.title')}
          detail={t('chain.today.body', { title: chainTurn.title })}
          onPress={() => router.push(chainTurnRoute(chainTurn.id))}
        />
      </ListGroup>
    ) : null,
    lifeOffer ? <RealLifeCard key="real-life" offer={lifeOffer} now={now} /> : null,
    moving?.welcomeBack && partner && welcomeName ? (
      <WelcomeBackCard
        key="welcome"
        welcome={moving.welcomeBack}
        partnerName={welcomeName}
        pausedUntil={moving.remindersPausedUntil}
        onTalk={() => {
          commitFeedback();
          router.push(callRoute(moving.welcomeBack?.partnerId ?? partner.persona.id));
        }}
        failed={pauseFailed}
        onPause={() => pause(PAUSE_DAYS)}
        onResume={() => pause(null)}
      />
    ) : null,
    moving?.streak.repair && partner ? (
      <RepairCard
        key="repair"
        repair={moving.streak.repair}
        days={moving.streak.days}
        partnerName={partner.persona.name}
        onTalk={() => {
          commitFeedback();
          router.push(callRoute(partner.persona.id));
        }}
      />
    ) : null,
    <Bento key="bento" home={home} restDay={moving ? !moving.streak.plannedToday : false} />,
    moving && moving.quests.quests.length ? (
      <QuestsCard
        key="quests"
        quests={moving.quests.quests}
        onOpen={() => router.push(ROUTES.quests)}
      />
    ) : null,
    // Once there was a first conversation, reminders are worth offering.
    partner && home.activity.conversations > 0 ? (
      <ReminderOffer key="reminders" partnerName={partner.persona.name} />
    ) : null,
    // Partner calls (5.28) once a few conversations show the learner keeps coming back.
    partner && home.activity.conversations >= CALLS_OFFER_AFTER ? (
      <CallsOffer key="calls" partnerName={partner.persona.name} />
    ) : null,
  ];
  const about = [
    moving?.recap && recap.closed === false ? (
      <RecapCard
        key="recap"
        recap={moving.recap}
        freshStart={moving.freshStart}
        milestoneName={milestoneName}
        onClose={recap.close}
      />
    ) : null,
    asking ? <ProfileQuestion key="question" /> : null,
    home.level ? (
      <LevelCard key="level" level={home.level} outlook={moving?.outlook ?? null} />
    ) : null,
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
      <Celebrations />
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
  const { home: store, penPal, coach, clock, motivation } = usePracticeServices();
  const { question } = useProfileServices();
  const home = useHome();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    void store.load();
    void question.load();
  }, [signedIn, store, question]);

  // Coming back to the tab after a while (a new day, a conversation on another device).
  useFocusEffect(
    useCallback(() => {
      void store.revisit();
      void question.revisit();
      void penPal.revisit();
      void coach.revisit();
      void motivation.revisit();
    }, [store, question, penPal, coach, motivation]),
  );

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const now = new Date(clock.now());
  return (
    <TabScreen
      refreshing={home.refreshing}
      onRefresh={
        home.phase === 'ready'
          ? () => {
              void store.refresh();
              void motivation.refresh();
            }
          : undefined
      }
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
