import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RadioApplauseCard, RadioCall } from '@konvami/api-client';
import { motion } from '@konvami/design-tokens';
import { Badge } from '@/components/badge';
import { Loop } from '@/components/motion';
import { Text } from '@/components/text';
import { Tile, TileChip, useTileInk } from '@/components/tile';
import { callTone } from '@/lib/radio';
import { useTheme } from '@/theme';

export const APPLAUSE: readonly RadioApplauseCard[] = ['bravo', 'ha_ha', 'me_too', 'wow'];
// The glyph on each applause card: decorative, the card's word is its label.
export const APPLAUSE_GLYPH: Record<RadioApplauseCard, string> = {
  bravo: '👏',
  ha_ha: '😂',
  me_too: '🙋',
  wow: '🤩',
};
export const REPORT_REASONS = [
  'harassment',
  'sexual',
  'personal',
  'hate',
  'off_topic',
  'other',
] as const;

// The on-air light: a dot that breathes as a studio's red lamp glows (pt).
const LIGHT = 10;
const GLOW = {
  from: { transform: [{ scale: 1 }], opacity: 1 },
  to: { transform: [{ scale: 1.5 }], opacity: 0.35 },
};

/** The studio's "on air" lamp and its word, in the tile's colours. Decorative lamp. */
export function OnAirLight({ live }: { live: boolean }) {
  const { t } = useTranslation();
  const ink = useTileInk();
  const { color } = useTheme();
  const dot = color[ink?.ink ?? 'fg'];
  return (
    <TileChip>
      <View aria-hidden style={{ width: LIGHT, height: LIGHT, pointerEvents: 'none' }}>
        <Loop keyframes={GLOW} duration={motion.breathe / 2} alternate play={live}>
          <View
            style={{ width: LIGHT, height: LIGHT, backgroundColor: dot, opacity: live ? 1 : 0.4 }}
            className="rounded-pill"
          />
        </Loop>
      </View>
      <Text variant="badge" tone={ink?.tone ?? 'fg'}>
        {live ? t('radio.onAir') : t('radio.offAir')}
      </Text>
    </TileChip>
  );
}

// The level meter: five bars that rise and fall out of step while the show plays (pt).
const BAR_WIDTH = 5;
const BAR_HEIGHT = 26;
const BARS = [0.55, 0.9, 0.7, 1, 0.6] as const;
const BAR_STAGGER_MS = 140;
const LEVEL = {
  from: { transform: [{ scaleY: 0.3 }] },
  to: { transform: [{ scaleY: 1 }] },
};

/** A small level meter that moves while something plays. Decorative and untouchable. */
export function SoundBars({ playing, tone }: { playing: boolean; tone?: string }) {
  const ink = useTileInk();
  const { color } = useTheme();
  const fill = tone ?? color[ink?.ink ?? 'fg'];
  return (
    <View
      aria-hidden
      style={{ height: BAR_HEIGHT, pointerEvents: 'none' }}
      className="flex-row items-end gap-1"
    >
      {BARS.map((share, index) => (
        <Loop
          key={index}
          keyframes={LEVEL}
          duration={motion.breathe / 4}
          delay={index * BAR_STAGGER_MS}
          alternate
          play={playing}
        >
          <View
            className="rounded-pill"
            style={{
              width: BAR_WIDTH,
              height: BAR_HEIGHT * (playing ? share : share / 2),
              backgroundColor: fill,
            }}
          />
        </Loop>
      ))}
    </View>
  );
}

/**
 * The top of every Radio screen: the tomato block of the talking family with the studio's lamp,
 * the title, what the screen is for and, optionally, the learner's own line under it.
 */
export function StudioHero({
  title,
  body,
  live,
  playing = false,
  children,
}: {
  title: string;
  body?: string;
  live: boolean;
  playing?: boolean;
  children?: ReactNode;
}) {
  return (
    <Tile color="tomato" bubble="top-right" className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <OnAirLight live={live} />
        <SoundBars playing={playing || live} />
      </View>
      <View className="gap-1.5">
        <Text variant="title" tone="onTomato" accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text tone="onTomato">{body}</Text> : null}
      </View>
      {children}
    </Tile>
  );
}

/** The "AI" mark beside an AI caller's or the host's name: never presented as a person. */
export function AiChip() {
  const { t } = useTranslation();
  return <Badge label={t('radio.ai')} tone="chip" />;
}

/** A call's status as a short tag: on air stands out, a call to look at is calm amber text. */
export function CallStatus({ call }: { call: Pick<RadioCall, 'status'> }) {
  const { t } = useTranslation();
  const label = t(`radio.calls.status.${call.status}`);
  const tone = callTone(call.status);
  if (tone === 'aired') return <Badge label={label} />;
  return (
    <Text variant="captionStrong" tone={tone === 'attention' ? 'warn' : 'muted'}>
      {label}
    </Text>
  );
}

/** The message for a refusal from the server, or the device. */
export function failureKey(code: string) {
  const known = [
    'unavailable',
    'consent_required',
    'suspended',
    'not_found',
    'not_joined',
    'closed',
    'no_language',
    'unsure',
    'invalid_value',
    'too_short',
    'too_long',
    'limit',
    'mic_denied',
    'network',
  ] as const;
  const found = known.find((one) => one === code);
  return `radio.failed.${found ?? 'unavailable'}` as const;
}
