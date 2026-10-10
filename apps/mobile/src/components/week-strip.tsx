import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { Pop } from '@/components/motion';
import { Text } from '@/components/text';
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
  return (
    <View className="flex-row justify-between">
      {days.map((day, i) => {
        const mark = (
          <View
            style={{ width: size.dayMark, height: size.dayMark }}
            className={`items-center justify-center rounded-pill ${MARK[day.state]}`}
          >
            {day.state === 'done' ? (
              <Icon name="check" color={color.onPrimary} size={size.icon} strokeWidth={3} />
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
              tone={day.state === 'today' || day.state === 'done' ? 'fg' : 'subtle'}
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
