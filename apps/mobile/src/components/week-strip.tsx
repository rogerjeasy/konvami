import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { Pop } from '@/components/motion';
import { Text } from '@/components/text';
import { useTileInk } from '@/components/tile';
import { staggerDelay } from '@/lib/motion';
import { useTheme } from '@/theme';

/** What a day of the week has been: practised, today and still open, past without practice, or ahead. */
export type WeekDayState = 'done' | 'today' | 'open' | 'ahead';

export interface WeekDay {
  /** A stable key: the day's date. */
  key: string;
  /** One letter under the mark ("M"). */
  initial: string;
  state: WeekDayState;
  /** What a screen reader says for the day ("Monday: practised"). */
  accessibilityLabel: string;
}

const MARK: Record<WeekDayState, string> = {
  done: 'bg-primary',
  today: 'border-2 border-primary',
  open: 'bg-track',
  ahead: 'border border-border',
};

/**
 * A week as seven round marks, Monday first: filled with a tick on the days practised, a ring
 * for today while it is still open. The filled days pop in one after another the first time.
 */
export function WeekStrip({ days }: { days: readonly WeekDay[] }) {
  const { color } = useTheme();
  // On a colour block the marks take the block's own ink (the butter streak tile on Today).
  const tile = useTileInk();
  const ink = tile ? color[tile.ink] : null;
  const tileMark = (state: WeekDayState) =>
    ink === null
      ? undefined
      : state === 'done'
        ? { backgroundColor: ink }
        : state === 'today'
          ? { borderWidth: 2.5, borderColor: ink }
          : undefined;
  return (
    <View className="flex-row justify-between">
      {days.map((day, i) => {
        const mark = (
          <View
            style={[{ width: size.dayMark, height: size.dayMark }, tileMark(day.state)]}
            className={`items-center justify-center rounded-pill ${
              tile
                ? day.state === 'done' || day.state === 'today'
                  ? ''
                  : tile.veil
                : MARK[day.state]
            }`}
          >
            {day.state === 'done' ? (
              <Icon
                name="check"
                color={tile ? color[tile.ground] : color.onPrimary}
                size={size.icon}
                strokeWidth={3}
              />
            ) : null}
          </View>
        );
        return (
          <View
            key={day.key}
            accessible
            accessibilityLabel={day.accessibilityLabel}
            className="flex-1 items-center gap-1.5"
          >
            {day.state === 'done' ? <Pop delay={staggerDelay(i)}>{mark}</Pop> : mark}
            <Text
              variant="captionStrong"
              tone={
                tile ? tile.tone : day.state === 'today' || day.state === 'done' ? 'fg' : 'subtle'
              }
              aria-hidden
            >
              {day.initial}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
