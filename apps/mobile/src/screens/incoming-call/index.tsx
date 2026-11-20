import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { motion, size } from '@konvami/design-tokens';
import type { Persona } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Avatar } from '@/components/avatar/avatar';
import { BlockScope } from '@/components/block-scope';
import { Button } from '@/components/button';
import { HeroLayout } from '@/components/hero-layout';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Loop, Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { formatTimeOfDay } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { heroDrawingSize } from '@/lib/layout';
import { staggerDelay } from '@/lib/motion';
import { callRoute, ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';
import { useReminderDevice } from '@/reminders/services';
import { useTheme } from '@/theme';

// The ringing drawing on a 288 pt frame: two rings that swell around the partner's portrait.
const FRAME = 288;
const RINGS = [288, 220] as const;
const PORTRAIT = 156;
// A ring swells and fades as a phone's ring would, the outer one a beat after the inner one.
const RING = {
  from: { transform: [{ scale: 0.86 }], opacity: 0.9 },
  to: { transform: [{ scale: 1 }], opacity: 0.25 },
};
const RING_STAGGER_MS = 400;
// The hero's share of a tall window: the question and three actions fit below it.
const HERO_SHARE = 0.46;
// "Remind me in an hour".
const LATER_MS = 60 * 60 * 1000;

// Positions in the entrance stagger: the portrait pops, then the words, then the actions.
const ORDER = { title: 2, line: 3, ask: 4, accept: 6, decline: 7, later: 8 } as const;

const toToday = () => router.dismissTo(ROUTES.today);

/** The partner's portrait inside rings that swell, as a phone rings. Decorative. */
function Ringing({ partner }: { partner: Persona }) {
  const { illustrationWidth } = useScreenLayout(HERO_SHARE);
  const { height: windowHeight } = useWindowDimensions();
  const width = heroDrawingSize({ frame: FRAME, available: illustrationWidth, windowHeight });
  const k = width / FRAME;
  const centred = (diameter: number) => ({
    position: 'absolute' as const,
    width: diameter * k,
    height: diameter * k,
    left: ((FRAME - diameter) / 2) * k,
    top: ((FRAME - diameter) / 2) * k,
  });
  return (
    <View style={{ width, height: width, pointerEvents: 'none' }} aria-hidden>
      {RINGS.map((diameter, index) => (
        <Loop
          key={diameter}
          keyframes={RING}
          duration={motion.breathe}
          delay={index * RING_STAGGER_MS}
          alternate
          style={centred(diameter)}
        >
          <View className="h-full w-full rounded-pill border-2 border-primary" />
        </Loop>
      ))}
      <Pop style={centred(PORTRAIT)}>
        <Avatar look={partner.look} size={PORTRAIT * k} mood="speaking" />
      </Pop>
    </View>
  );
}

/**
 * 5.28 A partner is calling (design note 2026-11-20-partner-calls): the screen a tapped ring
 * opens. Answering starts a short call (about three minutes) that the partner opens as the one
 * who rang; "Not now" goes to Today; "Remind me in an hour" rings once more. It is the app's own
 * screen behind a notification, never a phone call: no ringtone, no lock-screen call interface.
 */
export function IncomingCallScreen() {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const { partner: partnerId, ask } = useLocalSearchParams<{ partner: string; ask?: string }>();
  const { home: store, clock } = usePracticeServices();
  const home = useHome();
  const device = useReminderDevice();
  const [later, setLater] = useState<{ at: Date } | 'failed' | null>(null);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;

  const partner =
    home.phase === 'ready'
      ? home.data.partners.find(({ persona }) => persona.id === partnerId)?.persona
      : undefined;

  if (home.phase !== 'ready' || !partner) {
    return (
      <BlockScope block="forest">
        <HeroLayout
          heroShare={HERO_SHARE}
          hero={<View />}
          body={
            home.phase === 'ready' ? (
              <NoticeBox icon="info">{t('incomingCall.notFound')}</NoticeBox>
            ) : (
              <LoadState
                failed={home.phase === 'failed'}
                loadingLabel={t('call.status.connecting')}
                slowLabel={t('common.wakingUp')}
                failedLabel={t(home.error === 'network' ? 'errors.network' : 'onboarding.partners.loadFailed')}
                retryLabel={t('common.retry')}
                onRetry={() => void store.reload()}
              />
            )
          }
          actions={<Button variant="ghost" label={t('incomingCall.back')} onPress={toToday} />}
        />
      </BlockScope>
    );
  }

  const name = partner.name;

  function accept() {
    commitFeedback();
    router.replace(callRoute(partnerId, { rang: true }));
  }

  async function remindLater() {
    const at = new Date(clock.now() + LATER_MS);
    try {
      await device.snooze(
        {
          id: `call-${partnerId}`,
          at,
          title: t('reminders.call.title', { name }),
          body: ask ? t('reminders.call.about', { ask }) : t('reminders.call.body'),
          call: { partner: partnerId, ...(ask ? { ask } : {}) },
        },
        t('reminders.callsChannel'),
      );
      setLater({ at });
    } catch {
      setLater('failed');
    }
  }

  const time = (at: Date) =>
    formatTimeOfDay(
      i18n.language,
      `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`,
    );

  return (
    <BlockScope block="forest">
      <HeroLayout
        heroShare={HERO_SHARE}
        hero={<Ringing partner={partner} />}
        body={
          <>
            <Reveal delay={staggerDelay(ORDER.title)}>
              <Text variant="title" accessibilityRole="header">
                {t('incomingCall.calling', { name })}
              </Text>
            </Reveal>
            <Reveal delay={staggerDelay(ORDER.line)}>
              <Text tone="muted">{t('incomingCall.short')}</Text>
            </Reveal>
            {ask ? (
              <Reveal delay={staggerDelay(ORDER.ask)}>
                <View className="rounded-field bg-surface px-4 py-3">
                  <Text variant="bodySmall">{t('incomingCall.about', { ask })}</Text>
                </View>
              </Reveal>
            ) : null}
            {later ? (
              <View accessibilityLiveRegion="polite">
                <NoticeBox icon={later === 'failed' ? 'alert' : 'clock'}>
                  {later === 'failed'
                    ? t('incomingCall.laterFailed')
                    : t('incomingCall.laterDone', { name, time: time(later.at) })}
                </NoticeBox>
              </View>
            ) : null}
          </>
        }
        actions={
          later && later !== 'failed' ? (
            <Button label={t('incomingCall.back')} onPress={toToday} />
          ) : (
            <>
              <Reveal delay={staggerDelay(ORDER.accept)}>
                <Button
                  label={t('incomingCall.accept')}
                  leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
                  onPress={accept}
                />
              </Reveal>
              <Reveal delay={staggerDelay(ORDER.decline)}>
                <Button variant="ghost" label={t('incomingCall.decline')} onPress={toToday} />
              </Reveal>
              <Reveal delay={staggerDelay(ORDER.later)}>
                <TextButton label={t('incomingCall.later')} onPress={() => void remindLater()} />
              </Reveal>
            </>
          )
        }
      />
    </BlockScope>
  );
}
