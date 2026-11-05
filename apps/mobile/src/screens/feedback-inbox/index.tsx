import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FeedbackStatus, InboxFeedback } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChip } from '@/components/choice-chip';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { formatClock, formatShortDate } from '@/lib/format';
import { stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { usePracticeServices } from '@/practice/services';
import { ProfilePage } from '@/screens/profile/page';

// The platforms' own spellings (names, not words to translate).
const PLATFORM_NAMES = { ios: 'iOS', android: 'Android', web: 'Web' } as const;

const STATUSES: readonly FeedbackStatus[] = ['open', 'done'];

type Loaded =
  | { phase: 'loading' }
  | { phase: 'ready'; messages: InboxFeedback[] }
  | { phase: 'failed'; error: string };

/** One message: what it is about, the words, the device if the learner sent it, and what to do. */
function MessageCard({
  message,
  busy,
  onSet,
}: {
  message: InboxFeedback;
  busy: boolean;
  onSet: (status: FeedbackStatus) => void;
}) {
  const { t, i18n } = useTranslation();
  const { clock } = usePracticeServices();
  const when = `${formatShortDate(i18n.language, message.createdAt, new Date(clock.now()))}, ${formatClock(i18n.language, message.createdAt)}`;
  const { device } = message;
  return (
    <Card className="gap-3 p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge label={t(`help.category.${message.category}`)} />
      </View>
      <Text>{message.message}</Text>
      {device ? (
        <Text variant="small" tone="muted">
          {t('feedbackInbox.device', {
            platform: PLATFORM_NAMES[device.platform],
            appVersion: device.appVersion,
            osVersion: device.osVersion,
          })}
        </Text>
      ) : null}
      <Text variant="small" tone="subtle">
        {t('feedbackInbox.sentOn', { when })}
      </Text>
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        {message.status === 'open' ? (
          <Button
            variant="secondary"
            label={t('feedbackInbox.markDone')}
            disabled={busy}
            onPress={() => onSet('done')}
          />
        ) : (
          <TextButton
            tone="primary"
            label={t('feedbackInbox.reopen')}
            disabled={busy}
            onPress={() => onSet('open')}
          />
        )}
      </View>
    </Card>
  );
}

/**
 * 6.21 Feedback (spec §6.21.4, the owner's inbox): what learners sent from the Help screen, open
 * messages first, each marked done and opened again. Nobody is named. Only the owner's account can
 * read it; the server refuses anyone else.
 */
export function FeedbackInboxScreen() {
  const { t } = useTranslation();
  const { readFeedbackInbox, resolveFeedback } = usePracticeServices();
  const [status, setStatus] = useState<FeedbackStatus>('open');
  const [state, setState] = useState<Loaded>({ phase: 'loading' });
  // The message being changed, and whether the last change failed.
  const [busy, setBusy] = useState<string | null>(null);
  const [actionFailed, setActionFailed] = useState(false);
  // Raised to read the same list again (after a failure).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    readFeedbackInbox(status).then(
      ({ messages }) => current && setState({ phase: 'ready', messages }),
      (error: unknown) => current && setState({ phase: 'failed', error: apiErrorCode(error) }),
    );
    return () => {
      current = false;
    };
  }, [readFeedbackInbox, status, attempt]);

  async function change(message: InboxFeedback, next: FeedbackStatus) {
    setBusy(message.id);
    setActionFailed(false);
    try {
      await resolveFeedback(message.id, next);
      stepFeedback();
      // It leaves this list: the list shows one status.
      setState((now) =>
        now.phase === 'ready'
          ? { phase: 'ready', messages: now.messages.filter(({ id }) => id !== message.id) }
          : now,
      );
    } catch {
      setActionFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ProfilePage title={t('feedbackInbox.title')} body={t('feedbackInbox.body')}>
      {state.phase === 'failed' && state.error === 'not_owner' ? (
        <NoticeBox icon="lock">{t('feedbackInbox.notOwner')}</NoticeBox>
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
              {STATUSES.map((one) => (
                <ChoiceChip
                  key={one}
                  label={t(`feedbackInbox.status.${one}`)}
                  selected={status === one}
                  onPress={() => {
                    if (one === status) return;
                    setState({ phase: 'loading' });
                    setStatus(one);
                  }}
                />
              ))}
            </View>
          </Reveal>
          {actionFailed ? (
            <NoticeBox icon="alert">{t('feedbackInbox.actionFailed')}</NoticeBox>
          ) : null}
          {state.phase === 'ready' ? (
            state.messages.length === 0 ? (
              <NoticeBox icon="check">
                {t(status === 'open' ? 'feedbackInbox.emptyOpen' : 'feedbackInbox.emptyDone')}
              </NoticeBox>
            ) : (
              <View className="gap-2.5">
                {state.messages.map((message, i) => (
                  <Reveal key={message.id} delay={staggerDelay(i + 2)}>
                    <MessageCard
                      message={message}
                      busy={busy === message.id}
                      onSet={(next) => void change(message, next)}
                    />
                  </Reveal>
                ))}
              </View>
            )
          ) : (
            <LoadState
              failed={state.phase === 'failed'}
              loadingLabel={t('feedbackInbox.loading')}
              slowLabel={t('common.wakingUp')}
              failedLabel={t('feedbackInbox.loadFailed')}
              retryLabel={t('common.retry')}
              onRetry={() => {
                setState({ phase: 'loading' });
                setAttempt((count) => count + 1);
              }}
            />
          )}
        </>
      )}
    </ProfilePage>
  );
}
