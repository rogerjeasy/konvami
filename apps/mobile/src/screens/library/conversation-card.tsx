import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Conversation } from '@konvami/api-client';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/motion';
import { PersonaAvatar } from '@/components/persona-avatar';
import { Text } from '@/components/text';
import { wholeMinutes } from '@/lib/format';
import { relativeDayLabel, relativeDayPhrase } from '@/lib/relative-day';
import { useTheme } from '@/theme';

// Stands between the parts of a card's second line ("Yesterday · 8 min").
const SEPARATOR = ' · ';
// The portrait on a library card (pt, as on the v4 prototype).
const AVATAR = 52;
// The faint waveform under a card's title: how many bars, and their shortest and tallest (pt).
const WAVE_BARS = 34;
const WAVE_MIN = 4;
const WAVE_RANGE = 18;
const WAVE_BAR_WIDTH = 3;
// Faint on purpose: it says "a recording" without asking to be read.
const WAVE_OPACITY = 0.55;

/**
 * Bar heights for a conversation's decorative waveform, the same for the same conversation
 * every time (a small linear congruential generator seeded from its id). It is not the audio.
 */
export function waveHeights(id: string, bars = WAVE_BARS): number[] {
  let x = [...id].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) % 233280, 7);
  return Array.from({ length: bars }, () => {
    x = (x * 9301 + 49297) % 233280;
    return WAVE_MIN + Math.round((x / 233280) * WAVE_RANGE);
  });
}

/**
 * One past conversation in the library (v4): a white rounded card with the partner's portrait,
 * who it was with, when and for how long, a faint waveform and a play mark. The whole card
 * opens it.
 */
export function ConversationCard({
  conversation,
  now,
  onPress,
}: {
  conversation: Conversation;
  /** The device's time, for "today" and "yesterday". */
  now: Date;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { partner, startedAt } = conversation;
  const name = partner?.name ?? t('conversations.formerPartner');
  const duration = t('time.minutes', { count: wholeMinutes(conversation.seconds) });
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={t('conversations.rowLabel', {
        name,
        when: relativeDayPhrase(t, i18n.language, startedAt, now),
        duration,
      })}
      onPress={onPress}
    >
      <View className="min-h-tap flex-row items-center gap-3.5 rounded-card border border-border bg-chip p-3">
        {partner ? (
          <PersonaAvatar look={partner.look} diameter={AVATAR} />
        ) : (
          <View
            aria-hidden
            style={{ width: AVATAR, height: AVATAR }}
            className="items-center justify-center rounded-pill bg-surface"
          >
            <Icon name="user" color={color.fgSubtle} size={size.iconMd} />
          </View>
        )}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="heading">{name}</Text>
          <Text variant="small" tone="subtle">
            {[relativeDayLabel(t, i18n.language, startedAt, now), duration].join(SEPARATOR)}
          </Text>
          <View
            aria-hidden
            pointerEvents="none"
            className="mt-1.5 flex-row items-center gap-0.5 overflow-hidden"
            style={{ height: WAVE_MIN + WAVE_RANGE, opacity: WAVE_OPACITY }}
          >
            {waveHeights(conversation.id).map((height, i) => (
              <View
                key={i}
                className="rounded-pill bg-fg-subtle"
                style={{ width: WAVE_BAR_WIDTH, height }}
              />
            ))}
          </View>
        </View>
        <Icon name="play" color={color.fg} size={size.iconMd} />
      </View>
    </PressScale>
  );
}
