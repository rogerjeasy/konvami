import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ChainMine, ChainStory } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { Tile } from '@/components/tile';
import { useChainApi, useChainStory } from '@/chain/services';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import {
  chainInviteRoute,
  chainMineRoute,
  chainPlayRoute,
  chainTurnRoute,
  ROUTES,
} from '@/lib/routes';
import { reasonKey } from '@/screens/halves/parts';
import { useTheme } from '@/theme';
import { failureKey, genreIcon, HeardLine, LineBubble, SeatChain } from './parts';

/** What the story waits for, as one calm line. */
function Waiting({ story }: { story: ChainStory }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const checking = story.mine.some((line) => line.status === 'checking');
  const turn = story.seats.find((seat) => seat.seat === story.turnSeat);
  const text = checking
    ? t('chain.story.checking')
    : story.status === 'finishing'
      ? t('chain.story.finishing')
      : !turn
        ? null
        : turn.state === 'waiting'
          ? t('chain.story.waitingFree', { seat: turn.seat })
          : turn.ai
            ? t('chain.story.aiWriting', { name: turn.name })
            : t('chain.story.waiting', { name: turn.name });
  if (!text) return null;
  return (
    <View accessibilityLiveRegion="polite" className="flex-row items-center gap-3">
      {checking || turn?.ai || story.status === 'finishing' ? (
        <ActivityIndicator color={color.fgMuted} />
      ) : null}
      <Text tone="muted" className="flex-1">
        {text}
      </Text>
    </View>
  );
}

/** One of the learner's lines with what they heard before it. */
function MineRow({ line, storyId, lines }: { line: ChainMine; storyId: string; lines: number }) {
  const { t } = useTranslation();
  const problem = line.status === 'held' || line.status === 'failed';
  return (
    <Card className="gap-3 p-4">
      <Text variant="labelSmall" tone="muted">
        {t('chain.lineOf', { position: line.position, lines })}
      </Text>
      {line.before && !line.before.hidden ? <HeardLine heard={line.before} reveal={false} /> : null}
      {line.transcript ? (
        <LineBubble kind="line" name={t('chain.you')} text={line.transcript} mine />
      ) : null}
      {problem ? (
        <NoticeBox icon="info" tone="warn">
          {line.status === 'held' ? t('chain.story.held') : t('chain.story.failedLine')}
          {line.reasons.length
            ? ` · ${line.reasons.map((reason) => t(reasonKey(reason))).join(' · ')}`
            : ''}
        </NoticeBox>
      ) : null}
      {line.corrections.length > 0 ? (
        <TextButton
          tone="primary"
          label={t('chain.story.privateNotes')}
          onPress={() => router.push(chainMineRoute(storyId))}
        />
      ) : null}
    </Card>
  );
}

/**
 * 9.5 One story as the learner's seat knows it: the table and how far the chain is, whose turn
 * it is, and only what this seat may hear (the line before each of its own lines). The rest is a
 * surprise until the radio play (9.6).
 */
export function ChainStoryScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useChainApi();
  const { state, refresh, set } = useChainStory(signedIn ? (id ?? null) : null);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const story = state.phase === 'ready' ? state.data : null;
  const said = story ? story.seats.reduce((sum, seat) => sum + seat.lines, 0) : 0;

  async function act(change: () => Promise<ChainStory>) {
    commitFeedback();
    setBusy(true);
    setFailure(null);
    try {
      set(await change());
    } catch (error) {
      setFailure(t(failureKey(apiErrorCode(error))));
    } finally {
      setBusy(false);
      setLeaving(false);
    }
  }

  const actions = !story ? undefined : story.status === 'done' ? (
    <Button label={t('chain.story.listen')} onPress={() => router.push(chainPlayRoute(story.id))} />
  ) : story.myTurn ? (
    <Button
      label={t('chain.story.recordNow')}
      onPress={() => router.push(chainTurnRoute(story.id))}
    />
  ) : story.canFill ? (
    <Button
      variant="secondary"
      label={t('chain.story.fill')}
      loading={busy}
      onPress={() => void act(() => api.fillChainSeats(story.id))}
    />
  ) : undefined;

  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.chain)}
          />
        </View>
      }
      actions={actions}
    >
      {!story ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('chain.story.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('chain.story.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : (
        <>
          <Reveal>
            <PageHero
              color="pink"
              icon={genreIcon(story.genre)}
              title={story.title}
              body={t(`chain.genre.${story.genre}`, { defaultValue: story.genre })}
            />
          </Reveal>
          <Reveal delay={staggerDelay(1)}>
            <Card className="gap-3 p-4">
              <SeatChain
                seats={story.seats}
                said={said}
                lines={story.lines}
                turnSeat={story.status === 'open' ? story.turnSeat : null}
                mySeat={story.mySeat}
              />
              <Text variant="small" tone="muted">
                {t('chain.seats.lit', { said, lines: story.lines })}
              </Text>
            </Card>
          </Reveal>
          {story.myTurn ? (
            <Pop delay={staggerDelay(2)}>
              <Tile color="pink" bubble="bottom-left" className="gap-1.5">
                <Text variant="section" tone="onPink" accessibilityRole="header">
                  {t('chain.story.yourTurn')}
                </Text>
                <Text tone="onPink">{t('chain.story.yourTurnHint')}</Text>
              </Tile>
            </Pop>
          ) : (
            <Reveal delay={staggerDelay(2)}>
              <Waiting story={story} />
            </Reveal>
          )}
          {failure ? (
            <NoticeBox icon="info" tone="warn">
              {failure}
            </NoticeBox>
          ) : null}
          {story.inviteCode ? (
            <Reveal delay={staggerDelay(3)}>
              <View className="gap-1">
                <TextButton
                  tone="primary"
                  label={t('chain.story.invite')}
                  onPress={() => router.push(chainInviteRoute(story.id))}
                />
                <Text variant="small" tone="muted">
                  {t('chain.story.fillHint')}
                </Text>
              </View>
            </Reveal>
          ) : null}
          <Reveal delay={staggerDelay(4)}>
            <View className="gap-2.5">
              <Text variant="section" accessibilityRole="header">
                {t('chain.story.yours')}
              </Text>
              {story.mine.length === 0 ? (
                <Text tone="muted">{t('chain.mine.empty')}</Text>
              ) : (
                story.mine.map((line) => (
                  <MineRow key={line.id} line={line} storyId={story.id} lines={story.lines} />
                ))
              )}
              {story.status !== 'done' ? (
                <Text variant="small" tone="muted">
                  {t('chain.story.hiddenUntilEnd')}
                </Text>
              ) : null}
            </View>
          </Reveal>
          {story.status === 'open' ? (
            <Reveal delay={staggerDelay(5)}>
              <View className="gap-1">
                <TextButton label={t('chain.story.leave')} onPress={() => setLeaving(true)} />
              </View>
            </Reveal>
          ) : null}
          <ConfirmSheet
            visible={leaving}
            title={t('chain.story.leave')}
            body={t('chain.story.leaveHint')}
            confirmLabel={t('chain.story.leave')}
            cancelLabel={t('chain.cancel')}
            loading={busy}
            onConfirm={() => void act(() => api.leaveChainStory(story.id))}
            onCancel={() => setLeaving(false)}
          />
        </>
      )}
    </StepLayout>
  );
}
