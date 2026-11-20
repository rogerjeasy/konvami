import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { RadioApplauseCard, RadioReportReason, RadioSegment } from '@konvami/api-client';
import { size } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { PressScale, Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { ReportSheet } from '@/components/report-sheet';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { Tile } from '@/components/tile';
import { formatDayOfYear } from '@/lib/format';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { captionMs, nextInShow, previousInShow, takesApplause } from '@/lib/radio';
import { ROUTES } from '@/lib/routes';
import { usePracticeServices } from '@/practice/services';
import { useRadioApi, useRadioEpisode } from '@/radio/services';
import { useTheme } from '@/theme';
import { AiChip, APPLAUSE, APPLAUSE_GLYPH, REPORT_REASONS, SoundBars, StudioHero } from './parts';

/** The four applause cards under a call: one tap gives one, another takes it back. */
function ApplauseRow({
  segment,
  onApplaud,
}: {
  segment: RadioSegment;
  onApplaud: (card: RadioApplauseCard | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('radio.player.applause', { speaker: segment.speaker })}
      className="flex-row flex-wrap gap-2"
    >
      {APPLAUSE.map((card) => {
        const mine = segment.myApplause === card;
        const count = segment.applause[card] ?? 0;
        const label = t(`radio.player.cards.${card}`);
        return (
          <PressScale
            key={card}
            accessibilityRole="radio"
            accessibilityLabel={t('radio.player.count', { card: label, count })}
            accessibilityState={{ checked: mine }}
            onPress={() => onApplaud(mine ? null : card)}
          >
            <View
              className={`min-h-tap flex-row items-center gap-1.5 rounded-pill border px-3 ${
                mine ? 'border-primary bg-primary-soft' : 'border-border bg-surface'
              }`}
            >
              <Text aria-hidden variant="label">
                {APPLAUSE_GLYPH[card]}
              </Text>
              <Text variant="captionStrong" tone={mine ? 'primary' : 'muted'}>
                {label}
                {count > 0 ? ` · ${count}` : ''}
              </Text>
            </View>
          </PressScale>
        );
      })}
    </View>
  );
}

/** One line of the show: who speaks, the AI mark, the words, and what a listener can do. */
function SegmentCard({
  segment,
  current,
  onPlay,
  onApplaud,
  onReport,
}: {
  segment: RadioSegment;
  current: boolean;
  onPlay: () => void;
  onApplaud: (card: RadioApplauseCard | null) => void;
  onReport: () => void;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const host = segment.kind === 'host';
  return (
    <Card className={`gap-2.5 p-4 ${current ? 'border-2 border-primary' : ''}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${segment.speaker}: ${segment.text}`}
        accessibilityState={{ selected: current }}
        disabled={segment.hidden}
        onPress={onPlay}
        className="gap-1.5"
      >
        <View className="flex-row flex-wrap items-center gap-2">
          {current ? <SoundBars playing tone={color.primary} /> : null}
          <Text variant="labelMedium" className="shrink">
            {segment.speaker}
          </Text>
          {segment.ai ? <AiChip /> : null}
          {segment.mine ? <Badge label={t('radio.you')} /> : null}
        </View>
        {segment.hidden ? (
          <Text variant="small" tone="muted">
            {t('radio.player.hidden')}
          </Text>
        ) : (
          // The show is in the language learned: its words in the serif italic.
          <Text variant={host ? 'langBody' : 'langLine'}>{segment.text}</Text>
        )}
        {!segment.playable && !segment.hidden ? (
          <Text variant="caption" tone="subtle">
            {t('radio.player.captionsOnly')}
          </Text>
        ) : null}
      </Pressable>
      {takesApplause(segment) ? <ApplauseRow segment={segment} onApplaud={onApplaud} /> : null}
      {!host && !segment.hidden && !segment.mine ? (
        <View className="flex-row justify-end">
          <TextButton
            label={t('radio.player.report')}
            accessibilityLabel={t('radio.player.reportLine', { speaker: segment.speaker })}
            onPress={onReport}
          />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * 8.2 One show: Mia's lines and the calls, played one after another with their captions, the
 * four applause cards under each call, and a report on every call. A line the server could not
 * voice stays on screen for its reading time, so the show plays on.
 */
export function RadioEpisodeScreen() {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useRadioApi();
  const { clips } = usePracticeServices();
  const { state, refresh, set } = useRadioEpisode(signedIn ? (id ?? null) : null);
  const show = state.phase === 'ready' ? state.data : null;
  const [at, setAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reporting, setReporting] = useState<number | null>(null);
  // Each start of playback gets a number; a clip or timer of an older start does nothing.
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What playback moves on to when a line ends: the latest `playFrom`, set after each render.
  const onwardTo = useRef<(position: number | null) => void>(() => {});
  const segments = show?.segments ?? [];

  const halt = useCallback(() => {
    run.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    clips.stop();
  }, [clips]);

  useEffect(() => () => halt(), [halt]);

  const playFrom = useCallback(
    (position: number | null) => {
      halt();
      const token = run.current;
      if (position === null || !show) {
        setPlaying(false);
        setAt(null);
        if (position === null && show) {
          setFinished(true);
          successFeedback();
        }
        return;
      }
      const segment = show.segments[position];
      if (!segment) return;
      setAt(position);
      setPlaying(true);
      setFinished(false);
      const onward = () => {
        if (run.current === token) onwardTo.current(nextInShow(show.segments, position));
      };
      if (!segment.playable) {
        timer.current = setTimeout(onward, captionMs(segment.text));
        return;
      }
      api.getRadioSegmentAudio(show.id, segment.index).then(
        ({ url }) => {
          if (run.current === token) clips.play(url, onward);
        },
        // A sound that cannot be fetched is read as a caption.
        () => {
          if (run.current === token) timer.current = setTimeout(onward, captionMs(segment.text));
        },
      );
    },
    [api, clips, halt, show],
  );
  useEffect(() => {
    onwardTo.current = playFrom;
  }, [playFrom]);

  async function applaud(segment: RadioSegment, card: RadioApplauseCard | null) {
    if (!show) return;
    commitFeedback();
    set(await api.applaudRadioSegment(show.id, segment.index, card));
  }

  async function report(reason: RadioReportReason, note: string) {
    if (!show || reporting === null) return;
    const segment = segments[reporting];
    if (!segment) return;
    set(await api.reportRadioSegment(show.id, segment.index, { reason, note: note || null }));
    if (at === reporting) playFrom(nextInShow(segments, reporting));
    setReporting(null);
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const current = at !== null ? segments[at] : undefined;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.radio)}
          />
        </View>
      }
      actions={
        show ? (
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                variant="tomato"
                label={
                  playing
                    ? t('radio.player.pause')
                    : at !== null
                      ? t('radio.player.resume')
                      : t('radio.player.play')
                }
                leading={
                  <Icon
                    name={playing ? 'stop' : 'play'}
                    color={color.onTomato}
                    size={size.iconMd}
                  />
                }
                onPress={() => {
                  commitFeedback();
                  if (playing) {
                    halt();
                    setPlaying(false);
                  } else {
                    playFrom(at ?? nextInShow(segments, -1));
                  }
                }}
              />
            </View>
            {playing && at !== null ? (
              <HeaderButton
                icon="chevronRight"
                label={t('radio.player.next')}
                onPress={() => playFrom(nextInShow(segments, at))}
              />
            ) : null}
          </View>
        ) : undefined
      }
    >
      {!show ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('radio.player.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('radio.player.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : (
        <>
          <Reveal>
            <StudioHero
              title={t('radio.title')}
              body={`${formatDayOfYear(i18n.language, show.day)} · ${t('radio.hostedBy', { host: show.host })}`}
              live
              playing={playing}
            >
              <Text variant="langLarge" tone="onTomato">
                {show.question}
              </Text>
              {show.questionHelp !== show.question ? (
                <Text variant="small" tone="onTomato">
                  {show.questionHelp}
                </Text>
              ) : null}
            </StudioHero>
          </Reveal>
          {current ? (
            <Reveal key={current.index}>
              <Tile color="ink" className="gap-2" accessibilityLiveRegion="polite">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text variant="overline" tone="onInverse">
                    {t('radio.player.nowPlaying')}
                  </Text>
                  <Text variant="labelMedium" tone="onInverse">
                    {current.speaker}
                  </Text>
                  {current.ai ? <AiChip /> : null}
                </View>
                <Text variant="langLarge" tone="onInverse">
                  {current.text}
                </Text>
                {at !== null && previousInShow(segments, at) !== at ? (
                  <View className="flex-row">
                    <TextButton
                      label={t('radio.player.previous')}
                      onPress={() => playFrom(previousInShow(segments, at))}
                    />
                  </View>
                ) : null}
              </Tile>
            </Reveal>
          ) : null}
          {finished ? (
            <Pop>
              <NoticeBox icon="check" tone="primary">
                {t('radio.player.done')}
              </NoticeBox>
            </Pop>
          ) : null}
          <View className="gap-2.5">
            <Text variant="section" accessibilityRole="header">
              {t('radio.player.playlist')}
            </Text>
            {segments.map((segment, position) => (
              <Reveal key={segment.index} delay={staggerDelay(Math.min(position, 8) + 1)}>
                <SegmentCard
                  segment={segment}
                  current={position === at}
                  onPlay={() => playFrom(position)}
                  onApplaud={(card) => void applaud(segment, card)}
                  onReport={() => setReporting(position)}
                />
              </Reveal>
            ))}
          </View>
          <ReportSheet
            visible={reporting !== null}
            title={t('radio.report.title')}
            body={t('radio.report.body')}
            reasons={REPORT_REASONS}
            reasonLabel={(one) => t(`radio.report.reason.${one}`)}
            noteLabel={t('radio.report.note')}
            sendLabel={t('radio.report.send')}
            onSend={(reason, note) => report(reason, note)}
            onClose={() => setReporting(null)}
          />
        </>
      )}
    </StepLayout>
  );
}
