import { Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Chain, ChainStorySummary } from '@konvami/api-client';
import { size } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useChainHub } from '@/chain/services';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { chainPlayRoute, chainStoryRoute, ROUTES } from '@/lib/routes';
import { useTheme } from '@/theme';
import { genreIcon, SeatChain } from './parts';

function StoryRow({ story, lines }: { story: ChainStorySummary; lines: number }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const mine = story.seats.find((seat) => seat.me)?.seat ?? 1;
  const said = story.seats.reduce((sum, seat) => sum + seat.lines, 0);
  const turn = story.next === 'record';
  const open = () =>
    router.push(story.next === 'listen' ? chainPlayRoute(story.id) : chainStoryRoute(story.id));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${story.title}, ${t(`chain.next.${story.next}`)}`}
      onPress={open}
      className="active:opacity-pressed"
    >
      <Card className={`gap-3 p-4 ${turn ? 'border-2 border-fg' : ''}`}>
        <View className="flex-row items-center gap-3">
          <View
            aria-hidden
            className="items-center justify-center rounded-pill bg-pink"
            style={{ width: size.headerButton, height: size.headerButton }}
          >
            <Icon name={genreIcon(story.genre)} color={color.onPink} size={size.iconMd} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="labelMedium">{story.title}</Text>
            <Text variant="small" tone="muted">
              {t(`chain.genre.${story.genre}`, { defaultValue: story.genre })}
            </Text>
          </View>
          {turn || story.next === 'listen' ? (
            <Badge label={t(`chain.next.${story.next}`)} />
          ) : (
            <Text variant="small" tone="muted">
              {t(`chain.next.${story.next}`)}
            </Text>
          )}
        </View>
        <SeatChain seats={story.seats} said={said} lines={lines} turnSeat={null} mySeat={mine} />
      </Card>
    </Pressable>
  );
}

function HowItWorks() {
  const { t } = useTranslation();
  return (
    <Card className="gap-2.5 p-4">
      <Text variant="section" accessibilityRole="header">
        {t('chain.how.title')}
      </Text>
      {(['one', 'two', 'three', 'private'] as const).map((step, index) => (
        <View key={step} className="flex-row gap-3">
          <View
            aria-hidden
            className="min-h-7 min-w-7 items-center justify-center rounded-pill bg-pink px-1.5"
          >
            <Text variant="labelSmall" tone="onPink">
              {index + 1}
            </Text>
          </View>
          <Text tone="muted" className="flex-1">
            {t(`chain.how.${step}`)}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/**
 * 9.1 Story chain: the learner's stories (whose turn it is, how far the chain is) and a way to
 * start one or take a seat with a friend's code. No stranger hears a stranger: AI characters,
 * friends by code and Two Halves duos only.
 */
export function ChainScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { state, refresh } = useChainHub(signedIn);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const hub: Chain | null = state.phase === 'ready' ? state.data : null;
  const profile = hub?.profile ?? null;
  // Stories waiting for the learner come first, then the ones to hear, then the rest.
  const order = { record: 0, listen: 1, wait: 2, done: 3 } as const;
  const stories = [...(hub?.stories ?? [])].sort((a, b) => order[a.next] - order[b.next]);
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center justify-between">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.talk)}
          />
          {profile ? (
            <TextButton
              tone="primary"
              label={t('chain.settings')}
              onPress={() => router.push(ROUTES.chainSettings)}
            />
          ) : null}
        </View>
      }
      actions={
        hub?.available && !profile ? (
          <Button label={t('chain.join')} onPress={() => router.push(ROUTES.chainJoin)} />
        ) : hub?.available && profile ? (
          <View className="gap-2">
            <Button label={t('chain.start')} onPress={() => router.push(ROUTES.chainNew)} />
            <TextButton
              tone="primary"
              label={t('chain.redeem')}
              onPress={() => router.push(ROUTES.chainRedeem)}
            />
          </View>
        ) : undefined
      }
    >
      <Reveal>
        <PageHero color="pink" icon="book" title={t('chain.title')} body={t('chain.body')} />
      </Reveal>
      {!hub ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('chain.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('chain.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : !hub.available ? (
        <NoticeBox icon="info">{t('chain.closed')}</NoticeBox>
      ) : !profile ? (
        <Reveal delay={staggerDelay(1)}>
          <HowItWorks />
        </Reveal>
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <Text tone="muted">{t('chain.playingAs', { codename: profile.codename })}</Text>
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <View className="gap-2.5">
              <Text variant="section" accessibilityRole="header">
                {t('chain.yourStories')}
              </Text>
              {stories.length === 0 ? (
                <Text tone="muted">{t('chain.noStories')}</Text>
              ) : (
                stories.map((story, index) => (
                  <Reveal key={story.id} delay={staggerDelay(index + 3)}>
                    <StoryRow story={story} lines={hub.lines} />
                  </Reveal>
                ))
              )}
            </View>
          </Reveal>
        </>
      )}
    </StepLayout>
  );
}
