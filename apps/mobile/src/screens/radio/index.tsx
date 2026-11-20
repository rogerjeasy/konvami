import { Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Radio, RadioCall, RadioEpisodeCard } from '@konvami/api-client';
import { size } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Burst } from '@/components/celebration';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { Tile } from '@/components/tile';
import { formatClock, formatDayOfYear } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { airsWhen } from '@/lib/radio';
import { radioCallRoute, radioEpisodeRoute, ROUTES } from '@/lib/routes';
import { useRadioHub } from '@/radio/services';
import { useTheme } from '@/theme';
import { CallStatus, StudioHero } from './parts';

/** Today's show on the ink block: the question, who is in it, and Listen. */
function OnAirCard({ show }: { show: RadioEpisodeCard }) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  return (
    <Tile color="ink" className="gap-3">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text variant="overline" tone="onInverse">
          {t('radio.today.title')} · {formatDayOfYear(i18n.language, show.day)}
        </Text>
        {show.mine ? (
          <Text variant="captionStrong" tone="onInverse">
            ★ {t('radio.today.yours')}
          </Text>
        ) : null}
      </View>
      <Text variant="langLarge" tone="onInverse">
        {show.question}
      </Text>
      <Text variant="small" tone="onInverse">
        {t('radio.hostedBy', { host: show.host })} ·{' '}
        {t('radio.today.callers', { count: show.callers })} ·{' '}
        {t('radio.today.aiCallers', { count: show.aiCallers })}
      </Text>
      <Button
        variant="lime"
        label={t('radio.today.listen')}
        leading={<Icon name="play" color={color.onLime} size={size.iconMd} />}
        onPress={() => {
          commitFeedback();
          router.push(radioEpisodeRoute(show.id));
        }}
      />
    </Tile>
  );
}

/** When the learner's call aired in a recent show: a small celebration, once per visit. */
function AiredCard({ show }: { show: RadioEpisodeCard }) {
  const { t, i18n } = useTranslation();
  return (
    <Pop>
      <Tile color="butter" bubble="bottom-left" className="items-start gap-2">
        <View className="w-full flex-row items-center justify-center">
          <Burst />
        </View>
        <Text variant="tileTitle" tone="onButter" accessibilityRole="header">
          {t('radio.aired.title')}
        </Text>
        <Text tone="onButter">
          {t('radio.aired.body', { date: formatDayOfYear(i18n.language, show.day) })}
        </Text>
        <TextButton
          tone="primary"
          label={t('radio.aired.listen')}
          onPress={() => router.push(radioEpisodeRoute(show.id))}
        />
      </Tile>
    </Pop>
  );
}

/** The question the next show asks, when it airs, and the learner's call to it if any. */
function NextShowCard({ hub }: { hub: Radio }) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const next = hub.nextShow;
  if (!next) return null;
  const when = airsWhen(next.airsAt, new Date());
  const time = formatClock(i18n.language, next.airsAt);
  return (
    <Card className="gap-2.5 p-4">
      <Text variant="overline" tone="muted">
        {t('radio.next.title')}
      </Text>
      <Text variant="langLarge">{next.question}</Text>
      {next.questionHelp !== next.question ? (
        <Text variant="small" tone="muted">
          {next.questionHelp}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-2">
        <Icon name="clock" color={color.fgMuted} size={size.iconSm} />
        <Text variant="small" tone="muted">
          {when === 'today'
            ? t('radio.next.airsToday', { time })
            : t('radio.next.airsTomorrow', { time })}
        </Text>
      </View>
      {next.myCall ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('radio.next.yourCall')} ${t(`radio.calls.status.${next.myCall.status}`)}`}
          onPress={() => router.push(radioCallRoute(next.myCall?.id ?? ''))}
          className="min-h-tap flex-row flex-wrap items-center gap-2"
        >
          <Text variant="small">{t('radio.next.yourCall')}</Text>
          <CallStatus call={next.myCall} />
        </Pressable>
      ) : null}
    </Card>
  );
}

function CallRow({ call }: { call: RadioCall }) {
  const { t, i18n } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${call.question}, ${t(`radio.calls.status.${call.status}`)}`}
      onPress={() => router.push(radioCallRoute(call.id))}
    >
      <Card className="min-h-tap gap-1.5 p-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text variant="caption" tone="subtle">
            {formatDayOfYear(i18n.language, call.day)}
          </Text>
          <CallStatus call={call} />
        </View>
        <Text variant="langLine" numberOfLines={2}>
          {call.transcript || call.question}
        </Text>
      </Card>
    </Pressable>
  );
}

function HowItWorks({ time }: { time: string }) {
  const { t } = useTranslation();
  return (
    <Card className="gap-2.5 p-4">
      <Text variant="section" accessibilityRole="header">
        {t('radio.how.title')}
      </Text>
      <Text tone="muted">{t('radio.how.one', { time })}</Text>
      <Text tone="muted">{t('radio.how.two')}</Text>
      <Text tone="muted">{t('radio.how.three')}</Text>
      <Text tone="muted">{t('radio.how.private')}</Text>
    </Card>
  );
}

/**
 * 8.1 Radio Konvami: the show on air, the question on the line now, the learner's calls and the
 * way to call in. Talking family: the studio sits on the tomato block, today's show on ink.
 */
export function RadioScreen() {
  const { t, i18n } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { state, refresh } = useRadioHub(signedIn);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const hub = state.phase === 'ready' ? state.data : null;
  const profile = hub?.profile ?? null;
  const open = Boolean(hub?.available && hub.language);
  const time = hub?.nextShow ? formatClock(i18n.language, hub.nextShow.airsAt) : '';
  const calledNext = Boolean(hub?.nextShow?.myCall);
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
              label={t('radio.settings')}
              onPress={() => router.push(ROUTES.radioSettings)}
            />
          ) : null}
        </View>
      }
      actions={
        open && !hub?.suspended ? (
          // The way to call in is pinned, so it stays on screen on a small phone.
          <Button
            variant="tomato"
            label={
              !profile
                ? t('radio.joinToCall')
                : calledNext
                  ? t('radio.callAgain')
                  : t('radio.callIn')
            }
            onPress={() => {
              commitFeedback();
              router.push(profile ? ROUTES.radioCallIn : ROUTES.radioJoin);
            }}
          />
        ) : undefined
      }
    >
      <Reveal>
        <StudioHero title={t('radio.title')} body={t('radio.body')} live={Boolean(hub?.onAir)}>
          {profile ? (
            <Text variant="captionStrong" tone="onTomato">
              {t('radio.join.codename', { codename: profile.codename })}
            </Text>
          ) : null}
        </StudioHero>
      </Reveal>
      {!hub ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('radio.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('radio.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : !hub.available ? (
        <NoticeBox icon="info">{t('radio.closed')}</NoticeBox>
      ) : !hub.language ? (
        <NoticeBox icon="info">{t('radio.noLanguage')}</NoticeBox>
      ) : (
        <>
          {hub.aired ? (
            <Reveal delay={staggerDelay(1)}>
              <AiredCard show={hub.aired} />
            </Reveal>
          ) : null}
          <Reveal delay={staggerDelay(2)}>
            {hub.onAir ? (
              <OnAirCard show={hub.onAir} />
            ) : (
              <Card className="gap-2 p-4" accessibilityLiveRegion="polite">
                <Text variant="section" accessibilityRole="header">
                  {t('radio.today.title')}
                </Text>
                <Text tone="muted">
                  {hub.warmingUp ? t('radio.today.warming') : t('radio.today.none', { time })}
                </Text>
              </Card>
            )}
          </Reveal>
          <Reveal delay={staggerDelay(3)}>
            <NextShowCard hub={hub} />
          </Reveal>
          {hub.suspended ? (
            <NoticeBox icon="info" tone="warn">
              {t('radio.settingsPage.suspended')}
            </NoticeBox>
          ) : null}
          {profile && hub.calls.length > 0 ? (
            <Reveal delay={staggerDelay(4)}>
              <View className="gap-2.5">
                <Text variant="section" accessibilityRole="header">
                  {t('radio.calls.title')}
                </Text>
                {hub.calls.map((call) => (
                  <CallRow key={call.id} call={call} />
                ))}
              </View>
            </Reveal>
          ) : null}
          <Reveal delay={staggerDelay(5)}>
            <ListGroup>
              <ListRow
                icon="archive"
                title={t('radio.archive.row')}
                detail={t('radio.archive.rowHint')}
                onPress={() => router.push(ROUTES.radioArchive)}
              />
            </ListGroup>
          </Reveal>
          {!profile ? (
            <Reveal delay={staggerDelay(6)}>
              <HowItWorks time={time} />
            </Reveal>
          ) : null}
        </>
      )}
    </StepLayout>
  );
}
