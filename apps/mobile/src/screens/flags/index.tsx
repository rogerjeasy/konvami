import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FlagStatus, QueuedFlag } from '@konvami/api-client';
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

const STATUSES: readonly FlagStatus[] = ['open', 'resolved', 'dismissed'];

type Loaded =
  | { phase: 'loading' }
  | { phase: 'ready'; flags: QueuedFlag[] }
  | { phase: 'failed'; error: string };

/** One reported item: what kind it is and why it was reported, the text, and what to do next. */
function FlagCard({
  flag,
  busy,
  onSet,
}: {
  flag: QueuedFlag;
  busy: boolean;
  onSet: (status: FlagStatus) => void;
}) {
  const { t, i18n } = useTranslation();
  const { clock } = usePracticeServices();
  const when = `${formatShortDate(i18n.language, flag.flaggedAt, new Date(clock.now()))}, ${formatClock(i18n.language, flag.flaggedAt)}`;
  return (
    <Card className="gap-3 p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge label={t(`flagQueue.kind.${flag.kind}`)} />
        <Badge tone="surface" label={t(`flag.reasons.${flag.reason}`)} />
      </View>
      <Text>{flag.excerpt}</Text>
      {flag.note ? (
        <Text variant="small" tone="muted">
          {t('flagQueue.note', { note: flag.note })}
        </Text>
      ) : null}
      <Text variant="small" tone="subtle">
        {t('flagQueue.reportedOn', { when })}
      </Text>
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        {flag.status === 'open' ? (
          <>
            <Button
              variant="secondary"
              label={t('flagQueue.resolve')}
              disabled={busy}
              onPress={() => onSet('resolved')}
            />
            <TextButton
              label={t('flagQueue.dismiss')}
              disabled={busy}
              onPress={() => onSet('dismissed')}
            />
          </>
        ) : (
          <TextButton
            tone="primary"
            label={t('flagQueue.reopen')}
            disabled={busy}
            onPress={() => onSet('open')}
          />
        )}
      </View>
    </Card>
  );
}

/**
 * 6.14 Reports (spec §16.1, the owner's review queue): the partner lines and corrections
 * learners flagged, open ones first. Each is resolved (acted on) or dismissed (nothing wrong),
 * and can be opened again. Only the owner's account can read it; the server refuses anyone else.
 */
export function FlagQueueScreen() {
  const { t } = useTranslation();
  const { readFlagQueue, resolveFlag } = usePracticeServices();
  const [status, setStatus] = useState<FlagStatus>('open');
  const [state, setState] = useState<Loaded>({ phase: 'loading' });
  // The flag being changed, and whether the last change failed.
  const [busy, setBusy] = useState<string | null>(null);
  const [actionFailed, setActionFailed] = useState(false);
  // Raised to read the same list again (after a failure).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    readFlagQueue(status).then(
      ({ flags }) => current && setState({ phase: 'ready', flags }),
      (error: unknown) => current && setState({ phase: 'failed', error: apiErrorCode(error) }),
    );
    return () => {
      current = false;
    };
  }, [readFlagQueue, status, attempt]);

  async function change(flag: QueuedFlag, next: FlagStatus) {
    setBusy(flag.id);
    setActionFailed(false);
    try {
      await resolveFlag(flag.id, next);
      stepFeedback();
      // It leaves this list: the list shows one status.
      setState((now) =>
        now.phase === 'ready'
          ? { phase: 'ready', flags: now.flags.filter(({ id }) => id !== flag.id) }
          : now,
      );
    } catch {
      setActionFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ProfilePage title={t('flagQueue.title')} body={t('flagQueue.body')}>
      {state.phase === 'failed' && state.error === 'not_owner' ? (
        <NoticeBox icon="lock">{t('flagQueue.notOwner')}</NoticeBox>
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
              {STATUSES.map((one) => (
                <ChoiceChip
                  key={one}
                  label={t(`flagQueue.status.${one}`)}
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
          {actionFailed ? <NoticeBox icon="alert">{t('flagQueue.actionFailed')}</NoticeBox> : null}
          {state.phase === 'ready' ? (
            state.flags.length === 0 ? (
              <NoticeBox icon="check">{t(`flagQueue.empty.${status}`)}</NoticeBox>
            ) : (
              <View className="gap-2.5">
                {state.flags.map((flag, i) => (
                  <Reveal key={flag.id} delay={staggerDelay(i + 2)}>
                    <FlagCard
                      flag={flag}
                      busy={busy === flag.id}
                      onSet={(next) => void change(flag, next)}
                    />
                  </Reveal>
                ))}
              </View>
            )
          ) : (
            <LoadState
              failed={state.phase === 'failed'}
              loadingLabel={t('flagQueue.loading')}
              slowLabel={t('common.wakingUp')}
              failedLabel={t('flagQueue.loadFailed')}
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
