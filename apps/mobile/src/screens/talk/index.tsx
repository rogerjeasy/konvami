import { useCallback, useEffect, type ComponentProps } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { TabHeader, TabScreen } from '@/components/tab-screen';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { staggerDelay } from '@/lib/motion';
import { useHalvesHub } from '@/halves/services';
import { useRadioHub } from '@/radio/services';
import { callRoute, penPalRoute, ROUTES } from '@/lib/routes';
import { useHome, usePenPal, usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { ModeRow } from './mode-row';
import { PartnerPoster } from './partner-poster';

// A poster's width on a phone: most of the window, so the next one peeks in (pt, prototype).
const POSTER_WIDTH = 286;
// What is left of the window beside a poster, so the next one shows at the edge.
const PEEK = 56;
// Gap between posters (pt): Tailwind `gap-3`.
const POSTER_GAP = 12;

/**
 * 5.2 Talk: the learner's partners (spec §14.1). Choosing one starts a conversation with them;
 * the buttons under them lead to Persona Studio (6.4–6.6), where partners are made and changed.
 */
export function TalkScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { home: store, penPal: penPalStore, clock } = usePracticeServices();
  const home = useHome();
  const penPal = usePenPal();
  const waiting =
    penPal.phase === 'ready' && penPal.data.threads.some((thread) => thread.unread > 0);
  const { gutter } = useScreenLayout();
  const { width } = useWindowDimensions();
  const posterWidth = Math.min(POSTER_WIDTH, width - PEEK);
  const { color } = useTheme();
  const signedIn = status === 'signedIn';
  const halves = useHalvesHub(signedIn);
  const halvesOpen = halves.state.phase === 'ready' && halves.state.data.available;
  const radio = useRadioHub(signedIn);
  const radioOpen = radio.state.phase === 'ready' && radio.state.data.available;

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  // "Last talked" goes stale like Today does.
  useFocusEffect(
    useCallback(() => {
      void store.revisit();
      void penPalStore.revisit();
    }, [store, penPalStore]),
  );

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const now = new Date(clock.now());
  return (
    <TabScreen
      refreshing={home.refreshing}
      onRefresh={home.phase === 'ready' ? () => void store.refresh() : undefined}
    >
      <Reveal>
        <TabHeader title={t('talk.title')} body={t('talk.body')} />
      </Reveal>
      {home.phase === 'ready' ? (
        <View className="gap-3">
          {/* Posters in a row that snaps from one to the next; on wide windows they all fit. */}
          <Reveal delay={staggerDelay(1)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={posterWidth + POSTER_GAP}
              decelerationRate="fast"
              style={{ marginHorizontal: -gutter }}
              contentContainerStyle={{ paddingHorizontal: gutter, gap: POSTER_GAP }}
              accessibilityLabel={t('talk.partners')}
            >
              {home.data.partners.map((partner, i) => (
                <View key={partner.persona.id} style={{ width: posterWidth }}>
                  <PartnerPoster
                    partner={partner}
                    index={i}
                    now={now}
                    onTalk={() => router.push(callRoute(partner.persona.id))}
                  />
                </View>
              ))}
            </ScrollView>
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <View className="gap-1">
              <Button
                variant="secondary"
                label={t('talk.newPartner')}
                leading={<Icon name="plus" color={color.fg} size={size.iconMd} />}
                onPress={() => router.push(ROUTES.accountNewPartner)}
              />
              <TextButton
                label={t('talk.manage')}
                onPress={() => router.push(ROUTES.accountPartners)}
              />
            </View>
          </Reveal>
        </View>
      ) : (
        <LoadState
          failed={home.phase === 'failed'}
          loadingLabel={t('onboarding.partners.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            home.error === 'network' ? 'errors.network' : 'onboarding.partners.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      )}
      <View className="gap-2.5">
        <Reveal delay={staggerDelay(3)}>
          <Text variant="section" accessibilityRole="header">
            {t('talk.more')}
          </Text>
        </Reveal>
        {(
          [
            {
              key: 'roles',
              icon: 'users',
              blob: 'tomato',
              title: t('rolePlays.row'),
              detail: t('rolePlays.rowHint'),
              onPress: () => router.push(ROUTES.rolePlays),
            },
            // Two Halves (7.1): a voice mystery with another player, when it is open.
            ...(halvesOpen
              ? [
                  {
                    key: 'halves',
                    icon: 'compass' as const,
                    blob: 'tomato' as const,
                    title: t('halves.row'),
                    detail: t('halves.rowHint'),
                    onPress: () => router.push(ROUTES.halves),
                  },
                ]
              : []),
            // Radio Konvami (8.1): the daily call-in show, when it is open.
            ...(radioOpen
              ? [
                  {
                    key: 'radio',
                    icon: 'radio' as const,
                    blob: 'tomato' as const,
                    title: t('radio.row'),
                    detail: t('radio.rowHint'),
                    onPress: () => router.push(ROUTES.radio),
                  },
                ]
              : []),
            // Two of the learner's partners in one conversation (5.24).
            {
              key: 'together',
              icon: 'message',
              blob: 'tomato',
              title: t('talk.together'),
              detail: t('talk.togetherHint'),
              onPress: () => router.push(ROUTES.together),
            },
            {
              key: 'penPal',
              icon: 'mic',
              blob: 'pink',
              title: t('penPal.row'),
              detail: t('penPal.rowHint'),
              badge: waiting ? t('penPal.new') : undefined,
              onPress: () => router.push(penPalRoute()),
            },
            // A lesson is on one topic, so it starts from the grammar map (5.14).
            {
              key: 'lessons',
              icon: 'book',
              blob: 'forest',
              title: t('talk.lessons'),
              detail: t('talk.lessonsHint'),
              onPress: () => router.push(ROUTES.grammar),
            },
            {
              key: 'sounds',
              icon: 'volume',
              blob: 'butter',
              title: t('talk.pronunciation'),
              detail: t('talk.pronunciationHint'),
              onPress: () => router.push(ROUTES.pronunciation),
            },
            // Something of the learner's own (a letter, a page, a menu) is brought on 5.23.
            {
              key: 'import',
              icon: 'file',
              blob: 'ink',
              title: t('talk.import'),
              detail: t('talk.importHint'),
              onPress: () => router.push(ROUTES.import),
            },
          ] satisfies (ComponentProps<typeof ModeRow> & { key: string })[]
        ).map(({ key, ...row }, i) => (
          <Reveal key={key} delay={staggerDelay(4 + i)}>
            <ModeRow {...row} />
          </Reveal>
        ))}
      </View>
    </TabScreen>
  );
}
