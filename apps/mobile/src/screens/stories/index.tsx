import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { StorySummary } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { PressScale, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES, storyRoute } from '@/lib/routes';
import { usePracticeServices, useStories } from '@/practice/services';
import { useTheme } from '@/theme';
import { POLL_MS } from './use-episode';

/** Why the next episode could not be asked for, as the screen says it. */
const MAKE_FAILED = {
  pending: 'stories.makeFailed.pending',
  daily_limit: 'stories.makeFailed.daily_limit',
  no_partner: 'stories.makeFailed.no_partner',
  unavailable: 'stories.makeFailed.unavailable',
} as const;

const makeFailedKey = (code: string) =>
  code in MAKE_FAILED ? MAKE_FAILED[code as keyof typeof MAKE_FAILED] : 'stories.makeFailed.other';

/** One episode in the list: its number, title and who tells it, or that it is being written. */
function EpisodeRow({ episode }: { episode: StorySummary }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const title =
    episode.status === 'pending'
      ? t('stories.writing', { number: episode.number })
      : episode.status === 'failed'
        ? t('stories.failedEpisode')
        : episode.title;
  const names = episode.names.filter(Boolean).join(' & ');
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={`${t('stories.episode', { number: episode.number })}: ${title}`}
      disabled={episode.status !== 'ready'}
      onPress={() => router.push(storyRoute(episode.id))}
    >
      <View className="min-h-tap flex-row items-center gap-3 rounded-card border border-border bg-surface p-3.5">
        <View aria-hidden className="h-11 w-11 items-center justify-center rounded-field bg-pink">
          <Text variant="heading" tone="onPink">
            {episode.number}
          </Text>
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant={episode.status === 'ready' ? 'langLine' : 'body'}>{title}</Text>
          {names ? (
            <Text variant="small" tone="subtle">
              {t('stories.with', { names })}
            </Text>
          ) : null}
        </View>
        {episode.listened ? (
          <View className="flex-row items-center gap-1">
            <Icon name="check" color={color.success} size={size.iconSm} />
            <Text variant="small" tone="muted">
              {t('stories.listened')}
            </Text>
          </View>
        ) : null}
      </View>
    </PressScale>
  );
}

/**
 * 5.29 Stories (spec §6.7, gap 6 of the 2026-11-20 research): short listening episodes made
 * around the learner's own words, told by their partners, in a series that goes on. The list,
 * newest first, and the button that asks for the next one; an episode being written shows as
 * such until it is ready. Reached from Learn.
 */
export function StoriesScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { stories: store, makeStory } = usePracticeServices();
  const state = useStories();
  const [asking, setAsking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  const series = state.phase === 'ready' ? state.data : null;
  const writing = series?.episodes.some((e) => e.status === 'pending') ?? false;
  // While an episode is being written, the list is read again until it is ready.
  useEffect(() => {
    if (!writing) return;
    const timer = setInterval(() => void store.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [writing, store]);

  async function next() {
    commitFeedback();
    setAsking(true);
    setFailure(null);
    try {
      await makeStory();
    } catch (error) {
      setFailure(t(makeFailedKey(apiErrorCode(error))));
    } finally {
      setAsking(false);
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const left = series?.leftToday ?? 0;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.learn)}
          />
        </View>
      }
      actions={
        series && series.available ? (
          <View className="gap-2">
            <Button
              label={t('stories.next')}
              disabled={left === 0 || writing}
              loading={asking}
              onPress={() => void next()}
            />
            <Text variant="small" tone="subtle" className="text-center">
              {left > 0 ? t('stories.leftToday', { count: left }) : t('stories.noneLeft')}
            </Text>
          </View>
        ) : undefined
      }
    >
      <Reveal>
        <PageHero color="pink" icon="play" title={t('stories.title')} body={t('stories.body')} />
      </Reveal>
      {!series ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('stories.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(state.error === 'network' ? 'errors.network' : 'stories.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      ) : (
        <View className="gap-5">
          {failure ? (
            <View accessibilityLiveRegion="polite">
              <NoticeBox icon="info">{failure}</NoticeBox>
            </View>
          ) : null}
          {!series.available ? (
            <NoticeBox icon="info">{t('stories.makeFailed.unavailable')}</NoticeBox>
          ) : null}
          {series.episodes.length === 0 ? (
            <EmptyState icon="play" title={t('stories.emptyTitle')} body={t('stories.emptyBody')} />
          ) : (
            <Section title={t('stories.title')} count={series.episodes.length}>
              <View className="gap-2.5">
                {series.episodes.map((episode, i) => (
                  <Reveal key={episode.id} delay={staggerDelay(Math.min(i, 4))}>
                    <EpisodeRow episode={episode} />
                  </Reveal>
                ))}
              </View>
            </Section>
          )}
        </View>
      )}
    </StepLayout>
  );
}
