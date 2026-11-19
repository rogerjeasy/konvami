import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Conversation } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Avatar } from '@/components/avatar/avatar';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { IconTile } from '@/components/icon-tile';
import { Pop, Reveal } from '@/components/motion';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { wholeMinutes } from '@/lib/format';
import { successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { conversationRoute, reportRoute, ROUTES } from '@/lib/routes';
import type { ReportView } from '@/practice';
import { useHome, usePracticeServices, useReport, useScenarios } from '@/practice/services';
import { useTheme } from '@/theme';
import { BlockScope } from '@/components/block-scope';
import { Goals } from './goals';

// The server saves a conversation when its call has closed, a moment after the app left it.
// It is asked this often (ms), this many times: half a minute, far beyond a normal save.
const POLL_MS = 1500;
const MAX_POLLS = 20;

type Saving =
  | { phase: 'saving' }
  | { phase: 'saved'; conversation: Conversation }
  /** It could not be read, or is still not saved: it will be in the library once it is. */
  | { phase: 'pending' };

/** Follows a conversation that has just ended until the server has saved it. */
function useSavedConversation(id: string): Saving {
  const { readConversation } = usePracticeServices();
  const [saving, setSaving] = useState<Saving>({ phase: 'saving' });

  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    async function check() {
      try {
        const { conversation } = await readConversation(id);
        if (!current) return;
        if (conversation.endedAt) setSaving({ phase: 'saved', conversation });
        else if ((polls += 1) >= MAX_POLLS) setSaving({ phase: 'pending' });
        else timer = setTimeout(check, POLL_MS);
      } catch {
        if (current) setSaving({ phase: 'pending' });
      }
    }
    void check();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [readConversation, id]);

  return saving;
}

/** The top row: this screen is reached by ending a call, so there is no way back. */
const HEADER = <View className="min-h-tap" />;

const toToday = () => router.dismissTo(ROUTES.today);

/** A title and a sentence under a lead (a portrait, an icon), centered. */
function Message({
  lead,
  title,
  body,
  extra,
}: {
  lead: React.ReactNode;
  title: string;
  body: string;
  extra?: React.ReactNode;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-5 py-10">
      <Pop>{lead}</Pop>
      <Reveal delay={staggerDelay(2)}>
        <View className="items-center gap-2.5">
          <Text variant="title" accessibilityRole="header" className="text-center">
            {title}
          </Text>
          <Text tone="muted" className="text-center">
            {body}
          </Text>
        </View>
      </Reveal>
      {extra}
    </View>
  );
}

// The slight tilt of a sticker on the butter ground, as on the prototype.
const STICKER_TILT = '-1.5deg';

// Stands between the two counts of a finished report ("2 things to polish · 3 words to keep").
const SEPARATOR = ' · ';
/** The report was not written and will not arrive on its own: the learner can ask again. */
const NOT_WRITTEN = ['failed', 'timeout'];

/**
 * Where the conversation's report stands, under the summary: being written, ready (with what is
 * in it), not written this time, or not to come because too little was said (a learner who
 * waits for a report, or for words to keep, is told why there are none). Nothing when no report
 * was asked for.
 */
function ReportNews({ view }: { view: ReportView }) {
  const { t } = useTranslation();
  const { color } = useTheme();

  if (view.phase === 'writing') {
    return (
      <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2.5">
        {/* Shown on the butter ground: its own ink, in both themes. */}
        <ActivityIndicator size="small" color={color.onButter} />
        <Text variant="labelSmall" tone="onButter">
          {t('conversation.done.report.writing')}
        </Text>
      </View>
    );
  }
  if (view.phase === 'ready') {
    const { mistakes, words } = view.report;
    const counts = [
      mistakes.length ? t('conversation.done.report.polish', { count: mistakes.length }) : null,
      words.length ? t('conversation.done.report.words', { count: words.length }) : null,
    ].filter((count) => count !== null);
    return (
      // A sticker on the butter ground, set a little askew (v4 5.4).
      <Pop style={{ alignSelf: 'stretch' }}>
        <View
          accessibilityLiveRegion="polite"
          style={{ transform: [{ rotate: STICKER_TILT }] }}
          className="flex-row items-center gap-3 rounded-card bg-inverse p-4"
        >
          <View
            aria-hidden
            style={{ width: size.avatarSm, height: size.avatarSm }}
            className="items-center justify-center rounded-md bg-veil-light"
          >
            <Icon name="file" color={color.inverseAccent} size={size.iconMd} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="heading" tone="onInverse">
              {t('conversation.done.report.ready')}
            </Text>
            {counts.length ? (
              <Text variant="labelSmall" tone="onInverse">
                {counts.join(SEPARATOR)}
              </Text>
            ) : null}
          </View>
        </View>
      </Pop>
    );
  }
  const notWritten = view.phase === 'failed' && NOT_WRITTEN.includes(view.code);
  if (notWritten || view.phase === 'tooShort') {
    return (
      <Text variant="labelSmall" tone="onButter">
        {t(notWritten ? 'conversation.done.report.failed' : 'conversation.done.report.tooShort')}
      </Text>
    );
  }
  return null;
}

/** A conversation that counts: who it was with, how long, and the streak it kept going. */
/** After a role-play: how many of its goals the learner reached, and which. */
function GoalsReached({ id, reached }: { id: string; reached: readonly string[] }) {
  const { t } = useTranslation();
  const scenario = useScenarios().scenarios?.find((s) => s.id === id);
  if (!scenario) return null;
  return (
    <View className="items-start gap-1.5">
      <Text variant="labelMedium">
        {t('conversation.goals.reached', { count: reached.length, total: scenario.goals.length })}
      </Text>
      <Goals scenario={scenario} reached={reached} />
    </View>
  );
}

function Spoken({ conversation }: { conversation: Conversation }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { user } = useSession();
  const home = useHome();
  const { partner } = conversation;
  const duration = t('time.minutes', { count: wholeMinutes(conversation.seconds) });
  const activity = home.phase === 'ready' ? home.data.activity : null;
  const { view: report } = useReport(conversation.id);

  // One success haptic, with the celebration it belongs to.
  useEffect(() => successFeedback(), []);

  return (
    <BlockScope block="butter">
      <StepLayout
        header={HEADER}
        actions={
          // Once the report is there it is the next thing to look at; it leads to the transcript.
          report.phase === 'ready' ? (
            <>
              <Button
                label={t('conversation.done.report.open')}
                onPress={() => router.replace(reportRoute(conversation.id))}
              />
              <Button variant="ghost" label={t('conversation.done.home')} onPress={toToday} />
            </>
          ) : (
            <>
              <Button label={t('conversation.done.home')} onPress={toToday} />
              <Button
                variant="ghost"
                label={t('conversation.done.transcript')}
                onPress={() => router.replace(conversationRoute(conversation.id))}
              />
            </>
          )
        }
      >
        <View className="flex-1 justify-center gap-5 py-6">
          {/* Shown once Today's numbers have been read again and include this conversation. */}
          {activity?.practisedToday && activity.streakDays > 0 ? (
            <Pop>
              <View className="gap-1">
                <View className="flex-row items-center gap-1.5">
                  <Icon name="flame" color={color.onButter} size={size.icon} />
                  <Text variant="overline" tone="onButter">
                    {t('today.week.streak', { count: activity.streakDays })}
                  </Text>
                </View>
                {/* The number again, big: the overline already says it to a screen reader. */}
                <Text
                  variant="jumbo"
                  tone="onButter"
                  aria-hidden
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {activity.streakDays}
                </Text>
              </View>
            </Pop>
          ) : partner ? (
            <Pop>
              <Avatar look={partner.look} size={size.avatarXl} />
            </Pop>
          ) : null}
          <Reveal delay={staggerDelay(1)}>
            <View className="gap-2.5">
              <Text variant="hero" tone="onButter" accessibilityRole="header">
                {user?.firstName
                  ? t('conversation.done.title', { name: user.firstName })
                  : t('conversation.done.titleNoName')}
              </Text>
              <Text variant="emphasis" tone="onButter">
                {partner
                  ? t('conversation.done.body', { partner: partner.name, duration })
                  : t('conversation.done.bodyNoPartner', { duration })}
              </Text>
            </View>
          </Reveal>
          {conversation.scenario ? (
            <Reveal delay={staggerDelay(2)}>
              <GoalsReached id={conversation.scenario} reached={conversation.goalsReached} />
            </Reveal>
          ) : null}
          <ReportNews view={report} />
        </View>
      </StepLayout>
    </BlockScope>
  );
}

/**
 * 5.4 Conversation done: what a conversation that has just ended added up to. The server saves
 * it a moment after the call closes, so the screen waits for that, then brings Today and the
 * library up to date. Its report is written in the minute that follows; the screen says so and
 * offers it as soon as it is there. A call in which nothing was said is not practice, and the
 * screen says so without making a fuss.
 */
export function ConversationDoneScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { home, library } = usePracticeServices();
  const saving = useSavedConversation(id ?? '');
  const signedIn = status === 'signedIn';

  // The streak, the minutes and the list have changed with this conversation.
  const saved = saving.phase === 'saved';
  useEffect(() => {
    if (!saved) return;
    void home.refresh();
    void library.refresh();
  }, [saved, home, library]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;

  if (saving.phase === 'saving') {
    const label = t('conversation.done.saving');
    return (
      <StepLayout header={HEADER}>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={label}
          accessibilityLiveRegion="polite"
          className="flex-1 items-center justify-center gap-4 py-10"
        >
          <ActivityIndicator color={color.primary} />
          <View className="items-center gap-1.5">
            <Text variant="heading" className="text-center">
              {label}
            </Text>
            <Text tone="muted" className="text-center">
              {t('conversation.done.savingBody')}
            </Text>
          </View>
        </View>
      </StepLayout>
    );
  }

  if (saving.phase === 'saved' && saving.conversation.learnerTurns > 0) {
    return <Spoken conversation={saving.conversation} />;
  }

  const short = saving.phase === 'saved';
  return (
    <StepLayout
      header={HEADER}
      actions={<Button label={t('conversation.done.home')} onPress={toToday} />}
    >
      <Message
        lead={<IconTile icon={short ? 'mic' : 'clock'} />}
        title={t(short ? 'conversation.done.shortTitle' : 'conversation.done.pendingTitle')}
        body={t(short ? 'conversation.done.shortBody' : 'conversation.done.pendingBody')}
      />
    </StepLayout>
  );
}
