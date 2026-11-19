import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { motion, size } from '@konvami/design-tokens';
import { Animate } from '@/components/motion';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { Tile } from '@/components/tile';
import { fillKeyframes } from '@/lib/motion';
import { useAllowance, useMinutesBack, useProfileServices } from '@/profile/services';
import { withLine } from '@/voice/problems';

/**
 * The minutes left as a tomato bar on the ink block. `Meter` draws ink on a light track, which
 * would vanish on ink; this is the same bar in the block's colours.
 */
function MinutesBar({ share, label }: { share: number; label: string }) {
  const reduced = useReducedMotion();
  const fill = useMemo(() => fillKeyframes(reduced), [reduced]);
  const bounded = Math.min(Math.max(share, 0), 1);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(bounded * 100) }}
      style={{ height: size.meterHeight * 2 }}
      className="overflow-hidden rounded-pill"
    >
      {/* The track: the block's own text colour, faint, so it shows on ink in both themes. */}
      <View aria-hidden className="absolute inset-0 bg-on-inverse opacity-ring" />
      <Animate
        keyframes={fill}
        duration={motion.slow}
        delay={motion.enter}
        style={{ width: `${bounded * 100}%`, height: '100%', transformOrigin: 'left' }}
      >
        <View className="flex-1 rounded-pill bg-tomato" />
      </Animate>
    </View>
  );
}

// Below this many seconds a call cannot start (services/api: domain/voice.py MIN_CALL_SECONDS).
const MIN_CALL_SECONDS = 60;

/**
 * The learner's voice minutes this week (spec §6.19) on the ink block: how many are left, as a
 * bar that empties, and when they come back. On 6.1 Profile and 6.17 Plan; `children` adds a
 * line under it (the minutes bought in packs).
 */
export function VoiceMinutes({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const { allowance } = useProfileServices();
  const state = useAllowance();
  const back = useMinutesBack(true);

  if (state.phase === 'failed') {
    return (
      <View className="gap-1">
        <Text variant="small" tone="muted">
          {t('profile.minutes.loadFailed')}
        </Text>
        <TextButton
          tone="primary"
          label={t('common.retry')}
          onPress={() => void allowance.reload()}
        />
      </View>
    );
  }
  if (state.phase !== 'ready') return null;
  const { weeklySeconds, remainingSeconds } = state.data;
  const weekly = Math.round(weeklySeconds / 60);
  const left = Math.floor(remainingSeconds / 60);
  const usedUp = remainingSeconds < MIN_CALL_SECONDS;
  return (
    <Tile color="ink" className="gap-3">
      <View className="flex-row flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <Text variant="heading" tone="onInverse">
          {t('profile.minutes.left', { count: left })}
        </Text>
        <Text variant="labelSmall" tone="onInverse">
          {t('profile.minutes.ofWeekly', { weekly })}
        </Text>
      </View>
      <MinutesBar
        share={weeklySeconds > 0 ? remainingSeconds / weeklySeconds : 0}
        label={t('profile.minutes.spoken', { left, weekly })}
      />
      {back ? (
        <Text variant="small" tone="onInverse">
          {usedUp ? withLine(t('profile.minutes.usedUp'), back) : back}
        </Text>
      ) : null}
      {children}
    </Tile>
  );
}
