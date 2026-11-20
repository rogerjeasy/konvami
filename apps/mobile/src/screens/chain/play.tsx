import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ChainPlayPart, ChainReaction, ChainStory } from '@konvami/api-client';
import { size } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { Burst } from '@/components/celebration';
import { Button } from '@/components/button';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup, ToggleRow } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useChainApi, useChainStory } from '@/chain/services';
import { firstPart, nextPart, readingTime } from '@/lib/chain';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { chainMineRoute, chainStoryRoute, ROUTES } from '@/lib/routes';
import { usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { LineBubble } from './parts';

const REACTIONS: ChainReaction[] = ['laughed', 'surprised', 'loved', 'encore'];

type Player = { phase: 'idle' } | { phase: 'playing' | 'paused'; index: number };

/**
 * Plays the radio play part by part: each part's sound is asked for when its turn comes (an
 * address works for five minutes), a part without sound stays on screen as long as it takes to
 * read, and a part the learner reported is skipped.
 */
function useRadioPlay(story: ChainStory | null) {
  const api = useChainApi();
  const { clips } = usePracticeServices();
  const [player, setPlayer] = useState<Player>({ phase: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Each part started is a new run: a part ending after the learner paused does not go on.
  const run = useRef(0);

  useEffect(
    () => () => {
      run.current += 1;
      if (timer.current) clearTimeout(timer.current);
      clips.stop();
    },
    [clips],
  );

  async function playFrom(index: number | null) {
    if (!story || index === null) {
      setPlayer({ phase: 'idle' });
      return;
    }
    const part = story.play[index];
    if (!part) {
      setPlayer({ phase: 'idle' });
      return;
    }
    run.current += 1;
    const mine = run.current;
    setPlayer({ phase: 'playing', index });
    const after = () => {
      if (run.current === mine) void playFrom(nextPart(story.play, index));
    };
    if (part.hasAudio) {
      try {
        const { url } =
          part.kind === 'line' && part.lineId
            ? await api.getChainLineAudio(part.lineId)
            : await api.getChainPlayAudio(story.id, part.index);
        if (run.current !== mine) return;
        clips.play(url, after);
        return;
      } catch {
        // No sound now: the words stay on screen instead.
      }
    }
    timer.current = setTimeout(after, readingTime(part.text));
  }

  function stop() {
    run.current += 1;
    if (timer.current) clearTimeout(timer.current);
    clips.stop();
  }

  return {
    player,
    start: () => {
      commitFeedback();
      void playFrom(story ? firstPart(story.play) : null);
    },
    pause: () => {
      commitFeedback();
      stop();
      setPlayer((now) => (now.phase === 'playing' ? { phase: 'paused', index: now.index } : now));
    },
    resume: () => {
      commitFeedback();
      if (player.phase === 'paused') void playFrom(player.index);
    },
  };
}

function Part({
  part,
  current,
  captions,
}: {
  part: ChainPlayPart;
  current: boolean;
  captions: boolean;
}) {
  const { t } = useTranslation();
  const text = part.hidden
    ? t('chain.play.hidden')
    : !part.text && part.kind === 'line'
      ? t('chain.play.removed')
      : captions || current
        ? part.text
        : '…';
  return (
    <View
      accessibilityState={{ selected: current }}
      className={`rounded-card ${current ? 'border-2 border-fg p-1' : 'p-1'}`}
    >
      <LineBubble
        kind={part.kind}
        name={part.mine ? t('chain.you') : part.name}
        ai={part.ai && part.kind === 'line'}
        mine={part.mine}
        text={text}
      />
    </View>
  );
}

/**
 * 9.6 The radio play: the story revealed at last, with a burst, played part by part (four voices
 * and the narrator, who retells each line smoothly), captions off until the learner wants them,
 * and the fixed reaction cards: the only thing players say to each other besides their lines.
 */
export function ChainPlayScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useChainApi();
  const { state, refresh, set } = useChainStory(signedIn ? (id ?? null) : null);
  const story = state.phase === 'ready' ? state.data : null;
  const [captions, setCaptions] = useState(false);
  const { player, start, pause, resume } = useRadioPlay(story?.status === 'done' ? story : null);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;

  async function react(reaction: ChainReaction) {
    if (!story) return;
    successFeedback();
    set(await api.reactToChainStory(story.id, reaction));
  }

  const done = story?.status === 'done';
  const current = player.phase === 'idle' ? null : player.index;
  const actions = !done ? undefined : player.phase === 'playing' ? (
    <Button variant="secondary" label={t('chain.play.pause')} onPress={pause} />
  ) : player.phase === 'paused' ? (
    <Button label={t('chain.play.resume')} onPress={resume} />
  ) : (
    <Button
      label={t('chain.play.playAll')}
      leading={<Icon name="play" color={color.onPrimary} size={size.iconMd} />}
      onPress={start}
    />
  );

  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(id ? chainStoryRoute(id) : ROUTES.chain)}
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
      ) : !done ? (
        <Text tone="muted">{t('chain.story.finishing')}</Text>
      ) : (
        <>
          <View className="items-center justify-center">
            <Burst />
            <Pop style={{ alignSelf: 'stretch' }}>
              <PageHero color="pink" icon="film" title={story.title} body={t('chain.play.body')} />
            </Pop>
          </View>
          <Reveal delay={staggerDelay(1)}>
            <View className="gap-1">
              <ToggleRow label={t('chain.play.captions')} value={captions} onChange={setCaptions} />
              <Text variant="small" tone="muted">
                {t('chain.play.captionsHint')}
              </Text>
            </View>
          </Reveal>
          <View accessibilityLabel={t('chain.play.title')} className="gap-2">
            {story.play.map((part, index) => (
              <Reveal key={part.index} delay={staggerDelay(index + 2)}>
                <Part part={part} current={current === index} captions={captions} />
              </Reveal>
            ))}
          </View>
          <Reveal delay={staggerDelay(story.play.length + 2)}>
            <ChoiceGroup label={t('chain.play.react')} chips>
              {REACTIONS.map((reaction) => (
                <ChoiceChip
                  key={reaction}
                  label={`${t(`chain.play.reaction.${reaction}`)} · ${story.reactions[reaction] ?? 0}`}
                  selected={story.myReaction === reaction}
                  onPress={() => void react(reaction)}
                />
              ))}
            </ChoiceGroup>
          </Reveal>
          <Reveal delay={staggerDelay(story.play.length + 3)}>
            <View className="gap-1">
              {story.mine.length > 0 ? (
                <TextButton
                  tone="primary"
                  label={t('chain.play.notes')}
                  onPress={() => router.push(chainMineRoute(story.id))}
                />
              ) : null}
              <TextButton
                tone="primary"
                label={t('chain.play.again')}
                onPress={() => router.push(ROUTES.chainNew)}
              />
            </View>
          </Reveal>
        </>
      )}
    </StepLayout>
  );
}
