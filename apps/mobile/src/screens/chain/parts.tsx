import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { motion, size } from '@konvami/design-tokens';
import type { ChainHeard, ChainSeat } from '@konvami/api-client';
import { Badge } from '@/components/badge';
import { Icon } from '@/components/icon';
import { Loop, Pop } from '@/components/motion';
import { PlayButton, type PlayState } from '@/components/play-button';
import { RevealCaption } from '@/components/reveal-caption';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { pct, staggerDelay } from '@/lib/motion';
import { usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';

// A seat's disc on the chain (pt): four discs and their links fit a 320 pt phone with gutters.
const SEAT_DISC = 48;
// How much wider than its disc a seat is, for its name under it (pt).
const SEAT_LABEL_EXTRA = 8;
// The link bead between two lines (pt): eight of them sit under the seats.
const BEAD_HEIGHT = 10;
// How much the seat whose turn it is grows while it waits (a breath, not a bounce).
const TURN_BREATH = 1.06;
const BREATH = {
  from: { transform: [{ scale: 1 }] },
  [pct(100)]: { transform: [{ scale: TURN_BREATH }] },
};

/**
 * The table of the story chain: four seats in a row, the one whose turn it is breathing, and
 * under them eight beads, one per line, that light up one after another as lines are told (the
 * learner's own in lime). One element for a screen reader: who sits where and how far it is.
 */
export function SeatChain({
  seats,
  said,
  lines,
  turnSeat,
  mySeat,
}: {
  seats: readonly ChainSeat[];
  said: number;
  lines: number;
  turnSeat: number | null;
  mySeat: number;
}) {
  const { t } = useTranslation();
  const words = { waiting: t('chain.waitingSeat'), you: t('chain.you'), ai: t('chain.ai') };
  const names = seats.map((seat) => seatName(seat, words)).join(', ');
  return (
    <View
      accessible
      accessibilityLabel={`${t('chain.seats.label')}: ${names}. ${t('chain.seats.lit', { said, lines })}`}
      className="gap-3"
    >
      <View className="flex-row items-start">
        {seats.map((seat, index) => [
          index > 0 ? (
            <View
              key={`link-${seat.seat}`}
              aria-hidden
              style={{ marginTop: SEAT_DISC / 2 }}
              className="h-0.5 flex-1 rounded-pill bg-border"
            />
          ) : null,
          <SeatDisc key={seat.seat} seat={seat} turn={seat.seat === turnSeat} order={index} />,
        ])}
      </View>
      <Beads said={said} lines={lines} seatsCount={seats.length} mySeat={mySeat} />
    </View>
  );
}

function seatName(seat: ChainSeat, words: { waiting: string; you: string; ai: string }): string {
  if (seat.state === 'waiting') return words.waiting;
  if (seat.me && !seat.ai) return words.you;
  return seat.ai ? `${seat.name} (${words.ai})` : seat.name;
}

function SeatDisc({ seat, turn, order }: { seat: ChainSeat; turn: boolean; order: number }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const look = seat.me
    ? 'bg-lime'
    : seat.state === 'waiting'
      ? 'border-2 border-dashed border-border bg-surface'
      : seat.ai
        ? 'bg-pink'
        : 'bg-inverse';
  const ink = seat.me ? color.onLime : seat.ai ? color.onPink : color.onInverse;
  const initial = seat.me ? t('chain.you').slice(0, 1) : seat.name.slice(0, 1);
  const disc = (
    <View
      style={{ width: SEAT_DISC, height: SEAT_DISC }}
      className={`items-center justify-center rounded-pill ${look} ${turn ? 'border-2 border-fg' : ''}`}
    >
      {seat.state === 'waiting' ? (
        <Icon name="plus" color={color.fgSubtle} size={size.iconMd} />
      ) : (
        <Text variant="labelMedium" style={{ color: ink }}>
          {initial}
        </Text>
      )}
    </View>
  );
  return (
    <Pop delay={staggerDelay(order)}>
      <View className="items-center gap-1" style={{ width: SEAT_DISC + SEAT_LABEL_EXTRA }}>
        {turn ? (
          <Loop keyframes={BREATH} duration={motion.breathe} alternate>
            {disc}
          </Loop>
        ) : (
          disc
        )}
        <Text variant="caption" tone="muted" className="text-center">
          {seat.state === 'waiting' ? t('chain.waitingSeat') : seat.me ? t('chain.you') : seat.name}
        </Text>
        {seat.ai && !seat.me ? <Badge label={t('chain.ai')} tone="chip" /> : null}
      </View>
    </Pop>
  );
}

function Beads({
  said,
  lines,
  seatsCount,
  mySeat,
}: {
  said: number;
  lines: number;
  seatsCount: number;
  mySeat: number;
}) {
  const reduced = useReducedMotion();
  const beads = useMemo(() => Array.from({ length: lines }, (_, i) => i), [lines]);
  return (
    <View aria-hidden className="flex-row gap-1.5">
      {beads.map((index) => {
        const lit = index < said;
        const mine = (index % seatsCount) + 1 === mySeat;
        const tone = !lit ? 'bg-track' : mine ? 'bg-lime' : 'bg-fg';
        const bead = (
          <View style={{ height: BEAD_HEIGHT }} className={`w-full rounded-pill ${tone}`} />
        );
        // The told lines light up one after another, as if the chain were being linked.
        return lit && !reduced ? (
          <View key={index} className="flex-1">
            <Pop delay={staggerDelay(index)}>{bead}</Pop>
          </View>
        ) : (
          <View key={index} className="flex-1">
            {bead}
          </View>
        );
      })}
    </View>
  );
}

/**
 * A line heard in the story: the narrator on ink, an AI character or another player on paper
 * with an ink outline, the learner's own on lime. Words in the language learned, in the serif.
 * `reveal` hides the words behind a tap, so the learner listens first.
 */
export function LineBubble({
  name,
  text,
  kind,
  mine = false,
  ai = false,
  reveal = false,
}: {
  name: string;
  text: string;
  kind: 'narrator' | 'line';
  mine?: boolean;
  ai?: boolean;
  reveal?: boolean;
}) {
  const { t } = useTranslation();
  const narrator = kind === 'narrator';
  const box = narrator
    ? 'self-stretch bg-inverse'
    : mine
      ? 'self-end rounded-br-sm bg-lime'
      : 'self-start rounded-bl-sm border border-fg bg-surface';
  const tone = narrator ? 'onInverse' : mine ? 'onLime' : 'fg';
  const words = (
    <Text variant="langBody" tone={tone}>
      {text}
    </Text>
  );
  return (
    <View className={`max-w-[88%] gap-1 rounded-card px-3.5 py-3 ${box}`}>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text variant="labelSmall" tone={narrator ? 'inverseAccent' : mine ? 'onLime' : 'muted'}>
          {narrator ? t('chain.narrator') : name}
        </Text>
        {ai || narrator ? <Badge label={t('chain.ai')} tone="chip" /> : null}
      </View>
      {reveal ? (
        <RevealCaption text={text} hiddenLabel={t('chain.turn.showWords')} content={words} />
      ) : (
        words
      )}
    </View>
  );
}

/**
 * A round play button for one clip whose address the server gives for five minutes: it is asked
 * for when the learner taps, never before.
 */
export function ListenButton({
  label,
  address,
  local,
}: {
  label: string;
  /** Asks the server where the clip is. */
  address?: () => Promise<{ url: string }>;
  /** A recording on the phone (listening back before sending). */
  local?: string;
}) {
  const { t } = useTranslation();
  const { clips } = usePracticeServices();
  const [state, setState] = useState<PlayState>('idle');
  useEffect(() => () => clips.stop(), [clips]);

  async function play() {
    commitFeedback();
    if (state === 'playing') {
      clips.stop();
      setState('idle');
      return;
    }
    setState('loading');
    try {
      const url = local ?? (address ? (await address()).url : null);
      if (!url) {
        setState('idle');
        return;
      }
      setState('playing');
      clips.play(url, () => setState('idle'));
    } catch {
      setState('idle');
    }
  }

  return (
    <View className="flex-row items-center gap-3">
      <PlayButton
        label={state === 'playing' ? t('chain.turn.stop') : label}
        state={state}
        onPress={() => void play()}
      />
      <Text variant="labelMedium" className="flex-1">
        {label}
      </Text>
    </View>
  );
}

/** What the learner hears before their line: the narrator's opening, or another seat's line. */
export function HeardLine({ heard, reveal = true }: { heard: ChainHeard; reveal?: boolean }) {
  const { t } = useTranslation();
  if (heard.hidden) return <Text tone="muted">{t('chain.turn.hidden')}</Text>;
  return (
    <LineBubble
      kind={heard.kind}
      name={heard.name}
      ai={heard.ai}
      text={heard.text}
      reveal={reveal}
    />
  );
}

const TURN_FAILURES = [
  'too_short',
  'too_long',
  'limit',
  'mic_denied',
  'not_your_turn',
  'consent_required',
] as const;

/** The message for a line that could not be recorded or sent (9.4). */
export function turnFailureKey(code: string) {
  const known = TURN_FAILURES.find((one) => one === code) ?? 'unavailable';
  return `chain.turn.failed.${known}` as const;
}

const GENERAL = [
  'too_many_stories',
  'paused',
  'suspended',
  'no_language',
  'consent_required',
  'adults_only',
  'partner_not_joined',
  'no_shared_language',
  'not_found',
] as const;

/** The message for anything else the story chain refused. */
export function failureKey(code: string) {
  const known = GENERAL.find((one) => one === code) ?? 'unavailable';
  return `chain.failed.${known}` as const;
}

const REDEEM = [
  'not_found',
  'own_code',
  'limit',
  'adults_only',
  'no_shared_language',
  'too_many_stories',
  'paused',
  'partner_not_joined',
] as const;

export function redeemFailureKey(code: string) {
  const known = REDEEM.find((one) => one === code) ?? 'unavailable';
  return `chain.redeemScreen.failed.${known}` as const;
}

/** The icon of a genre, for the openings and the story cards. */
export const GENRE_ICON = {
  mystery: 'compass',
  comedy: 'gift',
  adventure: 'target',
  fairytale: 'book',
  future: 'globe',
  everyday: 'home',
} as const;

export function genreIcon(genre: string) {
  return GENRE_ICON[genre as keyof typeof GENRE_ICON] ?? 'book';
}
