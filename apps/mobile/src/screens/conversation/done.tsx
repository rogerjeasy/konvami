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
import { Pill } from '@/components/pill';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { wholeMinutes } from '@/lib/format';
import { successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { conversationRoute, ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';

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

/** A conversation that counts: who it was with, how long, and the streak it kept going. */
function Spoken({ conversation }: { conversation: Conversation }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { user } = useSession();
  const home = useHome();
  const { partner } = conversation;
  const duration = t('time.minutes', { count: wholeMinutes(conversation.seconds) });
  const activity = home.phase === 'ready' ? home.data.activity : null;

  // One success haptic, with the celebration it belongs to.
  useEffect(() => successFeedback(), []);

  return (
    <StepLayout
      header={HEADER}
      actions={
        <>
          <Button label={t('conversation.done.home')} onPress={toToday} />
          <TextButton
            tone="primary"
            label={t('conversation.done.transcript')}
            onPress={() => router.replace(conversationRoute(conversation.id))}
          />
        </>
      }
    >
      <Message
        lead={
          partner ? (
            <Avatar look={partner.look} size={size.avatarXl} />
          ) : (
            <IconTile icon="message" />
          )
        }
        title={
          user?.firstName
            ? t('conversation.done.title', { name: user.firstName })
            : t('conversation.done.titleNoName')
        }
        body={
          partner
            ? t('conversation.done.body', { partner: partner.name, duration })
            : t('conversation.done.bodyNoPartner', { duration })
        }
        extra={
          // Shown once Today's numbers have been read again and include this conversation.
          activity?.practisedToday && activity.streakDays > 0 ? (
            <Pop>
              <Pill
                tone="primary"
                label={t('today.week.streak', { count: activity.streakDays })}
                leading={<Icon name="flame" color={color.primaryText} size={size.iconSm} />}
              />
            </Pop>
          ) : null
        }
      />
    </StepLayout>
  );
}

/**
 * 5.4 Conversation done: what a conversation that has just ended added up to. The server saves
 * it a moment after the call closes, so the screen waits for that, then brings Today and the
 * library up to date. A call in which nothing was said is not practice, and the screen says so
 * without making a fuss.
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
